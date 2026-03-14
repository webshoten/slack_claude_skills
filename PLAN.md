# Skill Bot — プロジェクト計画書

## コンセプト

「スキルを育てて、専門チャットボットとして使う」Slack Bot。

ユーザーが対話を通じてスキル（専門知識・ルール・ツール・応答例）を育成し、
育ったスキルを読み込むことで高機能な専門チャットボットとして動作する。

スキルの状態はすべて **SKILL.md**（Markdownファイル）で管理される。

---

## 2つのチャットモード

| モード | 目的 | 動作 |
|--------|------|------|
| **育成モード** | スキルを作る・育てる | 対話しながら知識・ルール・例を蓄積し、SKILL.mdとして出力 |
| **実行モード** | スキルを使う | SKILL.mdを読み込み、その専門知識をベースにチャット応答 |

### コマンド体系

```
@SkillBot set-key          → APIキー登録（Modal）
@SkillBot train スキル名    → 育成モード開始（スレッドが作られる）
@SkillBot use スキル名      → 実行モード
@SkillBot list             → スキル一覧
@SkillBot（コマンドなし）    → ヘルプ表示 + APIキー設定状況（スレッドで返信）
```

### 育成モードの詳細（スレッドベース + 1ターン確認方式）

`@SkillBot train スキル名` でスレッドが作成され、そのスレッド内で育成を行う。

- チャンネルが会話で埋まらない
- 1スレッド = 1育成セッション

#### フロー

```
チャンネル: @SkillBot train react-expert
  └─ スレッド（Bot が自動作成）
      Bot: 「react-expert の育成を開始します」
      ユーザー: コンポーネントはAtomic Designで設計する
      Bot: 「以下をスキルに追加しますか？
            → コンポーネント設計はAtomic Designベース」
            [OK] [NG]
      ユーザー: OK
      Bot: 「追加しました」
      ユーザー: any禁止
      Bot: 「以下をルールに追加しますか？
            → TypeScriptでanyの使用を禁止」
            [OK] [NG]
      ユーザー: NG
      Bot: 「スキップしました。別の内容をどうぞ」
      ...
```

#### ポイント

- ユーザーの入力を Claude API が SKILL.md に適した形に整形して提案する
- OK/NG はボタンで操作（1ターンごとに確認）
- OK なら Canvas に追記、NG ならスキップ
- 意図しない内容が保存されることがない

#### セッション管理

- `thread_ts`（スレッドのタイムスタンプ）をキーに、育成中のスキル名を KV で管理
- スレッド内の返信は Slack の `message` イベント（`thread_ts` 付き）で受信
- Event Subscriptions に `message.channels` の追加が必要

### フロー図

```
SKILL.md → [育成モード] → SKILL.md（更新版）
SKILL.md → [実行モード] → 専門チャット応答
```

```
┌──────────────┐     export      ┌──────────────┐
│  育成モード    │ ──────────→   │  SKILL.md    │
│ (対話で育てる)  │ ←──────────   │  (Markdown)  │
└──────────────┘     import      └──────┬───────┘
                                        │ load
                                        ▼
                                 ┌──────────────┐
                                 │  実行モード    │
                                 │  (専門ボット)   │
                                 └──────────────┘
```

---

## SKILL.md のフォーマット

SKILL.mdがスキルの状態そのものであり、入力にも出力にもなる。
Claude Code の `.claude/skills/` 形式と互換性を意識する。

### 構成要素

| 要素 | 説明 | 例 |
|------|------|-----|
| **メタデータ** | 名前・説明・使用ツール | YAML frontmatter |
| **専門知識** | ドメイン固有の知識 | 技術スタック、ベストプラクティス |
| **ルール** | 守るべき制約 | 「TypeScript必須」「any禁止」 |
| **例（Few-shot）** | 良い応答のサンプル | Q&A形式の例 |

### 出力例

```markdown
---
name: react-expert
description: React/Next.jsの設計・実装に精通したスキル
tools:
  - web_search
  - read_docs
---

# React Expert

## 専門知識
- コンポーネント設計はAtomic Designベース
- 状態管理はZustandを推奨（Redux不要な場合）
- データフェッチはTanStack Query

## ルール
- TypeScript必須、any禁止
- Server Componentsをデフォルトで使う
- コンポーネントは1ファイル150行以内

## 例
### Q: フォームのバリデーションどうする？
A: React Hook Form + Zodの組み合わせを推奨。
サーバーアクションと組み合わせてサーバーサイドバリデーションも実施する。
```

---

## 技術スタック

### ランタイム: Deno（TypeScript）
- TypeScriptネイティブ（ビルド不要）
- パーミッションモデルでセキュリティ確保（`--allow-net` で接続先制限）
- Slack APIはHTTP直接 or Deno対応SDK

### ストレージ（役割で分離）
- **SKILL.md → Slack Canvas**
  - ユーザーがSlack上で直接閲覧・編集できる
  - 育成モードでBotがリアルタイム更新 → スキルが育つ様子が見える
  - Canvas API (`canvases.create`, `canvases.edit`, `canvases.sections.lookup`)
  - 複数スキル = 複数Canvas
- **APIキー → Deno KV（AES暗号化）**
  - 秘密情報のみ厳重に暗号化して保管
  - マスターキーは環境変数で管理
  - ローカルでもDeno Deployでもそのまま動く

### HTTPフレームワーク: Hono
- 軽量、Denoネイティブ対応
- ルーティング、ミドルウェア（Basic認証等）が組み込み
- ポータビリティ（Deno / Cloudflare Workers / Node.js）

### ホスティング: Deno Deploy
- 無料枠あり、Deno KV組み込み
- GitHub連携で自動デプロイ

### AI
- **Claude API**（Anthropic） — メインのLLM（fetchで直接呼び出し）

### プラットフォーム
- **Slack App**
- 個人の無料Slackワークスペースで開発・テスト可能
- api.slack.com/apps からApp作成（無料、審査不要）

### アーキテクチャ: Ports & Adapters（ヘキサゴナル）

コアロジックが外部サービスを直接知らない。Port（インターフェース）を通じてやり取りし、Adapterを差し替えるだけでインフラを変更できる。

```
┌─ Adapters ──────────────────────────────────────┐
│  SlackMessenger  SlackCanvasStore  DenoKvVault   │
│       │                │               │        │
│  ┌────┴────┐     ┌─────┴─────┐    ┌────┴────┐   │
│  │Messenger│     │SkillStore │    │KeyVault │   │
│  │  Port   │     │   Port    │    │  Port   │   │
│  └────┬────┘     └─────┬─────┘    └────┬────┘   │
│       └────────────────┼───────────────┘        │
│                   ┌────┴────┐                    │
│                   │  Core   │                    │
│                   │  Logic  │                    │
│                   └────┬────┘                    │
│                   ┌────┴────┐                    │
│                   │  LLM    │                    │
│                   │  Port   │                    │
│                   └────┬────┘                    │
│                   ClaudeLLM                      │
└──────────────────────────────────────────────────┘
```

#### Ports（インターフェース）

```typescript
// Messenger — チャット基盤（Slack / Discord / CLI）
interface Messenger {
  onMessage(handler): void
  reply(channelId, text): Promise<void>
  showModal(triggerId, view): Promise<void>
}

// SkillStore — スキル保存（Slack Canvas / Deno KV / File）
interface SkillStore {
  list(userId): Promise<Skill[]>
  get(userId, name): Promise<Skill | null>
  save(userId, skill): Promise<void>
  delete(userId, name): Promise<void>
}

// KeyVault — APIキー保管（Deno KV暗号化 / InMemory）
interface KeyVault {
  get(userId): Promise<string | null>
  save(userId, key): Promise<void>
  delete(userId): Promise<void>
}

// LLM — AI（Claude / OpenAI / Mock）
interface LLM {
  chat(messages, systemPrompt): Promise<string>
}
```

#### Adapters（本番構成）

| Port | 本番 Adapter | テスト用 |
|------|-------------|---------|
| Messenger | SlackMessenger | CLIMessenger |
| SkillStore | SlackCanvasStore | FileStore |
| KeyVault | DenoKvVault（AES暗号化） | InMemoryVault |
| LLM | ClaudeLLM | MockLLM |

#### 組み立て（DI）

```typescript
// 本番
const app = createApp({
  messenger: new SlackMessenger(slackToken),
  skillStore: new SlackCanvasStore(slackToken),
  keyVault: new DenoKvVault(encryptionKey),
  llm: new ClaudeLLM(),
})

// テスト
const app = createApp({
  messenger: new CLIMessenger(),
  skillStore: new FileStore("./skills"),
  keyVault: new InMemoryVault(),
  llm: new MockLLM(),
})
```

### データ配置

```
Slack Canvas（ユーザーに見える）
  ├─ 📄 react-expert        ← SKILL.mdの中身
  ├─ 📄 python-tutor
  └─ 📄 api-designer

Deno KV（ユーザーに見えない）
  └─ ["api_keys", slackUserId] → AES暗号化されたAPIキー
```

- スキル = Canvas。ユーザーが直接閲覧・編集可能
- APIキーだけ厳重に分離保管
- サーバーはロジックのみ、ほぼステートレス
- **Adapterを差し替えるだけでインフラ変更可能**

---

## 差別化ポイント

既存の類似ツールとの比較：

| アプリ | スキル育成 | SKILL.md入出力 | Slack対応 |
|--------|-----------|---------------|----------|
| Claude for Slack（公式） | なし | なし | あり |
| GPTs（OpenAI） | 作成のみ（育成なし） | なし | なし |
| Dify / Coze | 設定ベース | なし | 一部あり |
| **Skill Bot（本プロジェクト）** | **あり** | **あり** | **あり** |

「スキルを対話で育てる」＋「Markdownで入出力」の組み合わせは既存に存在しない。

---

## 決定事項

### APIキー: BYOK（Bring Your Own Key）方式
- ユーザーは **自分のClaude APIキー** を登録して使う
- APIキー未登録のユーザーはBotを利用できない（利用拒否）
- サーバー側に共有APIキーは持たない → 各自が自分の利用量・課金を管理

#### APIキー登録フロー（Modal方式）
```
ユーザー: @SkillBot set-key
Bot: 「APIキーを設定」ボタンを表示
ユーザー: ボタン押下 → モーダル（入力フォーム）が開く → キーを入力して送信
  → メッセージ履歴には一切残らない
  → Deno KVにAES暗号化して保存
Bot: 「APIキーを設定しました（...xxxx）」
```

#### 利用時フロー
```
ユーザー → メッセージ送信 → Bot（Deno KVからAPIキー復号・確認）
  ├─ キーあり → ユーザー自身のAPIキーでClaude APIに転送 → 応答
  └─ キーなし → 「APIキーを設定してください」＋設定ボタン表示
```

#### セキュリティ要件
- APIキーは **Deno KVにAES暗号化して保存**（平文保存禁止）
- マスターキーは環境変数（`ENCRYPTION_KEY`）で管理
- キー登録は **Modal経由**（Slackメッセージ履歴に残らない）
- キーの表示は末尾4文字のみ（`sk-ant-...xxxx`）

### 管理ページ: Deno KV ビューア

Deno Deployのログだけでは確認しづらいため、KVの状態を見れる軽量な管理ページを用意する。

```
/admin/kv            ← Deno KV の中身を一覧表示
  - 認証: ADMIN_PASSWORD（環境変数）でBasic認証
  - APIキーの値はマスク表示（...xxxx）
  - キーの一覧・検索・削除が可能
```

#### エンドポイント
```
/webhook/slack       ← Slackイベント受信（本番用）
/admin/kv            ← KVビューア（認証付き）
```

#### 要件
- Basic認証（`ADMIN_PASSWORD` 環境変数）
- APIキーの値は常にマスク表示
- KVのキー一覧、値のプレビュー、削除機能
- 最小限のHTML（フレームワーク不要）

---

## 未決定事項

- [x] ~~**言語選定**~~ → Deno (TypeScript)
- [x] ~~**スキルの保存先**~~ → Slack Canvas
- [x] ~~**APIキーの保存先**~~ → Deno KV（AES暗号化）
- [x] ~~**APIキー登録方法**~~ → Modal（メッセージ履歴に残らない）
- [x] ~~**複数スキルの管理**~~ → 複数Canvas（1スキル=1Canvas）
- [x] ~~**操作方式**~~ → メンション（@SkillBot）
- [x] ~~**スキルの所有モデル**~~ → 全員共有（スキルにuserIdを持たない。APIキーだけユーザーごと）
- [ ] **SKILL.mdの詳細仕様**: frontmatterのスキーマ、セクション構成の厳密な定義
- [x] ~~**育成モードのUX**~~ → スレッドベース + 1ターン確認方式（下記参照）

---

## ロードマップ

### MVP（まず動かす）
- Slack App + メンション方式
- 育成モード / 実行モード
- SKILL.md → Slack Canvas
- APIキー → Modal登録 + Deno KV暗号化保存
- KVビューア（/admin/kv）

### Post-MVP
- **画像対応**: Slackに投稿された画像をClaude Vision APIに転送
  - メッセージの `files` から画像をダウンロード（url_private + Bot Token）
  - base64化してClaude APIの `image` ブロックとして送信
  - 実行モード: 画像を見てスキルに基づいた回答
  - 育成モード: 画像付きの応答例として学習

---

## 開発

### 最初の一歩

```
Slack投稿 → Deno受信 → Deno KVに保存 → /admin/kvで確認
```

この最小パイプラインを貫通させるところから始める。

### その次

```
Slack投稿 → Deno受信 → Deno KV → Slack Canvasに反映
```

### その次

```
Slack投稿 → Deno受信 → Deno KV → Slackに返答
```

以降の進め方はその都度決める。
