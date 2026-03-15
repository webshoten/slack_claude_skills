# 実行モード（use）実装設計

## 概要

`@SkillBot use スキル名` でスレッドを作成し、保存済みの SKILL.md をシステムプロンプトとして Claude と会話する。
スレッド内で train → use の切り替えもシームレスに行える。

---

## フロー

### チャンネルから開始

```
1. ユーザー: @SkillBot use react-expert
2. Bot: スキルの存在確認 → スレッド返信「react-expert モードで会話を開始します」
3. Bot: use_sessions に記録（threadTs → { skillName, startTs }）
4. ユーザー:（スレッド内で）このコンポーネントのリファクタ方針を教えて
5. Bot: SKILL.md をシステムプロンプト + startTs 以降の会話履歴で Claude API（Sonnet）に送信 → 回答
6. 4〜5 を繰り返す
```

### スレッド内で train → use に切り替え

```
1. ユーザー: @SkillBot train react-expert → 育成のやり取り（diff, OK/NG 等）
2. ユーザー: @SkillBot use react-expert
3. Bot: use_sessions に記録（startTs = この時点の ts）
4. ユーザー: この設計方針でレビューして
5. Bot: startTs 以降のメッセージだけを会話履歴として使う（育成時のやり取りは含まない）
```

---

## コマンド分岐

| 状況 | 動作 |
|------|------|
| `use スキル名` | スキル存在確認 → セッション開始 |
| `use`（スキル名なし）+ スレッド内 use セッションあり | セッションのスキルで継続（なければエラー） |
| `use`（スキル名なし）+ チャンネル | 「スキル名を指定してください」 |
| スキルが存在しない | 「スキル名 はまだ作成されていません」+ 利用可能なスキル一覧を表示 |

### スレッド内での use コマンド

| 状況 | 動作 |
|------|------|
| `use X`（同じスキル、use セッション中） | 「すでに X モードです」 |
| `use Y`（別のスキル） | use_sessions を上書き（新しい startTs） |
| train セッション中に `use X` | use_sessions を作成（train_sessions はそのまま残す） |

### スレッド内での train コマンド（use セッション中）

| 状況 | 動作 |
|------|------|
| `train X` | use_sessions を消す → train_sessions が使われる |

---

## train との違い

| | train | use |
|---|---|---|
| 目的 | SKILL.md を編集する | SKILL.md を使って会話する |
| Claude モデル | Haiku | Sonnet |
| Claude の役割 | 育成アシスタント（diff 提案） | スキルに基づく回答者 |
| OK/NG ボタン | あり | なし |
| pending 保存 | あり | なし |
| 会話履歴 | 不要（1ターンずつ独立） | 必要（startTs 以降の文脈を維持） |
| ツール（tool use） | なし | web_fetch（ウェブページ取得） |

---

## セッション管理

### KV の構造

train と use でセッションを完全に分離する。

```
// train（既存のまま変更なし）
["train_sessions", threadTs] → "react-expert"

// use（新規）
["use_sessions", threadTs]  → { skillName: "react-expert", startTs: "1710000500.000001" }
```

- 既存の `SessionStore` は KV キーを `["sessions", ...]` → `["train_sessions", ...]` にリネーム
- インターフェースは変更なし
- use 用は `UseSessionStore` を新規作成

### モード切り替えのルール

- `use` コマンド実行時 → use_sessions を作成（startTs = この時点の ts）
- `train` コマンド実行時 → use_sessions を消す（あれば）
- use → train → use と交互に切り替えても、use のたびに新しい startTs で再作成される

### handleThreadMessage の分岐

スレッド内メッセージを受けたとき、どちらのセッションか判定する。

```
1. use_sessions を確認 → あれば use として処理
2. train_sessions を確認 → あれば train として処理
3. どちらもなし → 無視
```

### 会話履歴の取得

Slack API `conversations.replies` でスレッドの会話履歴を取得し、`startTs` 以降のメッセージだけを使う。

```
conversations.replies で全メッセージ取得
  → startTs 以降のメッセージだけフィルタ
  → bot_id あり → role: "assistant"
  → bot_id なし → role: "user"
  → メンション（<@BOT_ID> を含む）は除外（コマンドなので会話履歴に不要）
  → LlmMessage[] に変換
```

- KV に会話履歴を保存する方式もあるが、Slack が履歴を持っているので二重管理になる
- Bot Token Scopes に `channels:history` / `groups:history` は設定済み

---

## モデルとツール

### 使用モデル

- train: `claude-haiku-4-5-20251001`（JSON 整形が主なので軽量モデルで十分）
- use: `claude-sonnet-4-6`（スキルに基づく高品質な回答が必要）

### tool use: web_fetch

use モードでは Claude に `web_fetch` ツールを与える。Claude がウェブページの取得が必要と判断したら自動的に使う。

```
ユーザー: 名古屋市で8万円の賃貸を探して
  → Claude が web_fetch で Google 検索URLを取得
  → サーバーが fetch → HTMLをテキスト化して Claude に返す
  → Claude が結果からリンクを見つけて再度 web_fetch
  → 最終回答をスレッドに投稿
```

- 最大10回までツール呼び出し可能（ループ上限）
- HTMLタグは除去してテキストのみ返す（トークン節約）
- 5,000文字を超える場合は切り詰め（レートリミット対策）
- 検索したい場合は Claude が Google の検索URLを自分で組み立てて使う
- Google が bot ブロックした場合、自動的に DuckDuckGo にフォールバック
- プロンプトで「必要最小限のページだけ取得すること」を指示

### Llm インターフェースの拡張

```typescript
type LlmTool = { name: string; description: string; input_schema: any };

interface Llm {
  validate(apiKey: string): Promise<boolean>;
  chat(
    apiKey: string,
    messages: LlmMessage[],
    systemPrompt: string,
    model?: string,
    tools?: LlmTool[],
  ): Promise<string>;
}
```

- `model` と `tools` はオプション。省略すれば従来通り（Haiku、ツールなし）
- tool use のループ処理は `ClaudeLlm` 内で完結（呼び出し元は意識しない）

---

## システムプロンプト（use 用）

```
以下のスキルに基づいて応答してください。
スキルに記載されたルール・知識・方針に従い、ユーザーの質問や依頼に対応してください。
あなたは Claude です。Claude としての能力はすべて使えます。
返答は Slack のスレッドに投稿されるため、簡潔にしてください。

## ツールの使い方
web_fetch ツールでウェブページを取得できます。
- 検索したい場合: https://www.google.com/search?q=キーワード を取得して検索結果を得る
  （ブロックされた場合は自動で DuckDuckGo にフォールバックされます）
- 特定サイトを見たい場合: URLを直接指定して取得する
- 複数ページをクロールしたい場合: 取得結果からリンクを拾って順に取得する
- URLが404の場合は推測でリトライせず、まず検索で正しいURLを見つけること
- 必要最小限のページだけ取得すること。大量のクロールはしない
- ユーザーの質問に答えるのに十分な情報が得られたら、それ以上取得せず回答する

## スキル
{SKILL.md の内容}
```

---

## 既存コマンドとの関係

### show コマンド

use セッション中に `show` を実行しても問題なし。show は独立した処理（スキル内容を表示するだけ）で、セッション状態に影響しない。

### list コマンド（実装済み）

use とは独立。`@SkillBot list` でスキル一覧を表示。
スキルが存在しない場合の use コマンドでも一覧を表示する。

---

## 必要な変更

### core/ports.ts（実装済み）
- `UseSession` 型 + `UseSessionStore` インターフェース追加
- `ThreadMessage` 型 + `Messenger.getThreadReplies` 追加
- `LlmTool` 型追加、`Llm.chat` に `model?` と `tools?` パラメータ追加

### adapters/kv/session-store.ts（実装済み）
- KV キーを `["sessions", ...]` → `["train_sessions", ...]` にリネーム

### adapters/kv/use-session-store.ts（実装済み・新規）
- `DenoKvUseSessionStore` — `["use_sessions", threadTs]` に UseSession を保存

### adapters/slack/messenger.ts（実装済み）
- `getThreadReplies(channel, threadTs)` — `conversations.replies` を呼び出し
- `slackApiJson` — レスポンスを返す版の Slack API 呼び出し

### adapters/llm/claude.ts（実装済み）
- `chat` に `model` と `tools` パラメータ追加
- tool use のループ処理（最大10回）
- `web_fetch` ツール実行（fetch → HTMLテキスト化 → 5,000文字で切り詰め）
- Google bot ブロック検知 → DuckDuckGo 自動フォールバック

### core/use.ts（実装済み・新規）
- `handleUseStart` — スキル存在確認 → use セッション開始 → 開始メッセージ（存在しない場合はスキル一覧表示）
- `handleUseMessage` — スレッド内メッセージ → 会話履歴取得 → Claude API（Sonnet + web_fetch ツール）→ 回答

### core/app.ts（実装済み）
- `useSessionStore` を Ports に追加
- `handleMention` に `use` コマンドと `list` コマンドのルーティング追加
- `handleThreadMessage` で use_sessions → train_sessions の順にチェックして分岐

### core/train.ts（実装済み）
- 育成用システムプロンプトを改善（Slack ボットとしての口調、内部形式の用語を避ける）

---

## 実装ステップ

### Step 1: セッションのリネームと UseSessionStore 追加（完了）
- 既存 SessionStore の KV キーを `["train_sessions", ...]` にリネーム
- `UseSessionStore` インターフェース + `DenoKvUseSessionStore` を追加
- `createApp` の ports に `useSessionStore` を追加

### Step 2: use コマンドの基本フロー（完了）
- `core/use.ts` 新規作成
- `handleUseStart` — スキル存在確認 → use セッション開始 → 開始メッセージ
- `app.ts` に use コマンドと list コマンドのルーティング追加

### Step 3: スレッド内会話 + ツール対応（完了）
- Messenger に `getThreadReplies` 追加（`conversations.replies`）
- `handleUseMessage` — 会話履歴取得（startTs 以降 + メンション除外）→ Claude API（Sonnet）→ 回答
- `app.ts` の `handleThreadMessage` で use_sessions → train_sessions の順に分岐
- `Llm.chat` に `model` と `tools` パラメータ追加
- `web_fetch` ツール実装（HTML取得 → テキスト化 → Claude に返す → ループ）
- use 用システムプロンプトにツールの使い方を記載

### Step 4: スレッド内でのモード切り替え（未実装）
- `handleUseInThread` — 同じスキル（すでにモード）/ 別のスキル（上書き）/ train からの切り替え
- train コマンド実行時に use_sessions を消す処理を train.ts に追加
- use → train → use の交互切り替えが正しく動くことを確認
