# 育成モード（train）実装設計

## 概要

`@SkillBot train スキル名` でスレッドを作成し、対話を通じてスキルを育成する。
ユーザーの入力を Claude API が既存の SKILL.md と照らし合わせて変更を提案し、1ターンごとに確認して保存する。

新規スキルの作成だけでなく、既存スキルへの追加・編集・削除にも対応する。

---

## SKILL.md の形式

Anthropic の Agent Skills 仕様に準拠する。

```markdown
---
name: スキル名
description: このスキルの説明（いつ・何に使うか）
---

（本文: マークダウン自由形式）
```

- YAML frontmatter（name + description）が必須
- 本文のセクション構成は自由。スキルの内容に応じて Claude が適切に構成する
- 「専門知識/ルール/例」のような固定セクションは設けない
- 参考: [Anthropic Skills 仕様](https://github.com/anthropics/skills)

---

## フロー

### 新規スキルの場合

```
1. ユーザー: @SkillBot train react-expert
2. Bot: ユーザーのメッセージにスレッド返信 → ガイドメッセージを投稿
3. Bot: セッションを KV に記録（ユーザーのメッセージの ts → スキル名）
4. ユーザー: （スレッド内で）コンポーネントはAtomic Designで設計する
5. Bot: Claude API でユーザー入力を SKILL.md 形式に整形
6. Bot: 「以下をスキルに追加しますか？
         + コンポーネント設計はAtomic Designベース」
         [OK] [NG]
7. ユーザー: OK → スキルに保存 / NG → スキップ
8. 4〜7 を繰り返す
```

#### 新規作成時のガイドメッセージ

```
react-expert を新規作成します。

このスキルに覚えさせたいことを自由に送ってください。
知識、ルール、手順、応答例など、なんでもOKです。
1つずつ送信してください。内容を整形して確認します。
```

### 既存スキルの場合

```
1. ユーザー: @SkillBot train react-expert
2. Bot: スレッド返信 → 現在の SKILL.md の内容を表示
3. ユーザー: Atomic Designやめて、Feature-based構成にして
4. Bot: Claude API が既存 SKILL.md と照合し、差分を提案
5. Bot: 「以下の変更を行いますか？
         - 削除: コンポーネント設計はAtomic Designベース
         + 追加: コンポーネント設計はFeature-based構成」
         [OK] [NG]
6. ユーザー: OK → SKILL.md を更新 / NG → スキップ
7. 3〜6 を繰り返す
```

#### 既存スキル再開時のメッセージ

```
react-expert の育成を再開します。

現在のスキル:
---
（SKILL.md の内容を表示）
---

追加・編集・削除したい内容を送ってください。
```

### スレッド内での train コマンド

| 状況 | 動作 |
|------|------|
| `train`（スキル名なし）+ セッションあり | 「現在 X を育成中です」 |
| `train`（スキル名なし）+ セッションなし | 「スキル名を指定してください」 |
| `train X`（同じスキル） | 「すでに X を育成中です」 |
| `train Y`（別のスキル） | Y に切り替え + ガイドメッセージ |
| `train X`（セッションなし） | 新規セッション開始 |

### 操作の種類

ユーザーは自然言語でスレッドに書くだけ。Claude API が既存 SKILL.md と照らし合わせて判断する。

| 操作 | ユーザー入力例 | Claude の提案 |
|------|--------------|-------------|
| 追加 | 「状態管理はZustandを推奨」 | `+ 状態管理はZustandを推奨（Redux不要な場合）` |
| 編集 | 「ZustandじゃなくてJotaiにして」 | `- 状態管理はZustandを推奨` → `+ 状態管理はJotaiを推奨` |
| 削除 | 「Server Componentsのルール消して」 | `- Server Componentsをデフォルトで使う` |

追加・編集・削除を区別するロジックは不要。Claude API に既存 SKILL.md を丸ごとコンテキストとして渡すので、Claude が適切に判断する。

---

## アーキテクチャ

### createApp パターン

`core/app.ts` の `createApp(ports)` で全 Port を受け取り、クロージャで保持する。
各ハンドラはイベント固有の引数だけで呼び出せる。

```typescript
const skillBot = createApp({
  messenger, messageStore, keyVault, skillStore, sessionStore, llm,
});

// main.ts での呼び出し
skillBot.handleMention(channel, user, text, ts, threadTs);
skillBot.handleApiKeyButton(triggerId, channel);
skillBot.handleApiKeySave(userId, channel, key);
```

### 責務分離

| ファイル | 責務 |
|---------|------|
| `core/app.ts` | `createApp` + `handleMention`（コマンドの振り分け） |
| `core/train.ts` | 育成ロジック（`handleTrainStart`, `handleTrainInThread`, `handleTrainStatus`） |
| `core/apikey.ts` | APIキーロジック（`handleApiKeyButton`, `handleApiKeySave`） |
| `core/ports.ts` | 全 Port インターフェース定義 |

### セッション管理

- セッションキー = ユーザーの `train` メッセージの `ts`（= スレッドの親メッセージ）
- `startThread` は不要。既存の `reply(channel, text, ts)` でスレッド返信する
- スレッド内の返信は `thread_ts` 付きイベントで受信 → セッションと紐付け

---

## 必要な Port

### SkillStore（実装済み）

スキルは全員共有（userId なし）。

```typescript
interface SkillStore {
  get(name: string): Promise<string | null>;
  save(name: string, content: string): Promise<void>;
  list(): Promise<string[]>;
  delete(name: string): Promise<void>;
}
```

- MVP では Deno KV に保存（`["skills", name]`）。Post-MVP で Slack Canvas に移行

### SessionStore（実装済み）

```typescript
interface SessionStore {
  start(threadTs: string, skillName: string): Promise<void>;
  get(threadTs: string): Promise<string | null>;
  end(threadTs: string): Promise<void>;
}
```

KV キー: `["sessions", threadTs]` → スキル名

### Llm（実装済み）

```typescript
interface Llm {
  validate(apiKey: string): Promise<boolean>;
  chat(apiKey: string, messages: Message[], systemPrompt: string): Promise<string>;
}
```

`chat` を追加。ユーザーの APIキーで Claude API を呼ぶ。

### Messenger（実装済み）

```typescript
// 既存
reply(channel: string, text: string, threadTs?: string): Promise<void>;
// 追加予定
replyInThread(channel: string, threadTs: string, text: string, blocks?: unknown[]): Promise<void>;
```

`replyInThread`: OK/NG ボタン付きの返信など、blocks を含むスレッド内投稿に使う。

---

## イベント処理

### app_mention（実装済み）

`threadTs` を含むように拡張済み。スレッド内からのメンションかどうかを判定できる。

### thread_message（実装済み）

`message.channels` イベントでスレッド内の返信を受信する。
`parseSlackEvent` に追加:

```typescript
| { kind: "thread_message"; channel: string; user: string; text: string; ts: string; threadTs: string }
```

- `thread_ts` があり `bot_id` がない → ユーザーからのスレッド返信
- Bot 自身のメッセージは無視する（無限ループ防止）

### Interaction: OK/NG ボタン（未実装）

`parseSlackInteraction` に追加:

```typescript
| { kind: "train_confirm"; approved: boolean; threadTs: string; channel: string; user: string }
```

- `action_id: "train_ok"` → approved: true
- `action_id: "train_ng"` → approved: false

---

## Core ロジック

### handleTrainStart（実装済み）

```
train コマンド受信
  → スキル名を取得
  → SkillStore.get(name) で既存スキルの有無を確認
  → messenger.reply(channel, message, ts) でスレッド返信
    - 新規: ガイドメッセージ
    - 既存: 現在の SKILL.md を表示
  → SessionStore.start(ts, skillName) で KV に記録
```

### handleTrainInThread（実装済み）

```
スレッド内から train コマンド受信
  → SessionStore.get(threadTs) でセッション確認
  → 同じスキル → 「育成中です」
  → 別のスキル → 切り替え + ガイドメッセージ
  → セッションなし → 新規セッション開始
```

### handleTrainStatus（実装済み）

```
スレッド内で train（スキル名なし）
  → セッションあり → 「現在 X を育成中です」
  → セッションなし → 「スキル名を指定してください」
```

### handleThreadMessage（実装済み）

```
スレッド内メッセージ受信（メンションなし）
  → SessionStore.get(threadTs) でセッション確認（なければ無視）
  → KeyVault.get(userId) で APIキーを取得（未登録なら設定を促す）
  → SkillStore.get(name) で既存 SKILL.md を取得
  → Claude API に送信:
    - システムプロンプト（育成アシスタント）
    - 既存 SKILL.md（コンテキスト）
    - ユーザー入力
  → Claude が返す: diff（差分表示）+ updated（適用後の SKILL.md 全体）
  → diff + OK/NG ボタンをスレッドに投稿
  → updated を一時的に KV に保存（ボタン押下時に使う）
```

### handleTrainConfirm（未実装）

```
OK/NG ボタン押下
  → OK: 一時保存した SKILL.md で SkillStore.save() → 「反映しました」
  → NG: 一時保存を破棄 → 「スキップしました。別の内容をどうぞ」
```

---

## Claude API のシステムプロンプト（育成用）

```
あなたはスキル育成アシスタントです。
ユーザーの入力に基づいて SKILL.md を更新してください。

## 現在の SKILL.md
{既存の内容。新規の場合は空テンプレート}

## SKILL.md の形式
- YAML frontmatter（name, description）+ マークダウン本文
- セクション構成は自由。内容に応じて適切に構成する
- 簡潔に、要点のみ記述する

## あなたの役割
- ユーザーの入力を解釈し、SKILL.md への変更を提案する
- 追加・編集・削除を自然言語から判断する
- 既存の内容と重複しないようにする
- ユーザーの意図が曖昧な場合は、確認の質問をする

## 出力形式
JSON形式で出力。説明や前置きは不要。

入力が明確な場合（変更を提案）:
{"type":"proposal","diff":"変更の説明","updated":"変更適用後の SKILL.md 全体（frontmatter 含む）"}

入力が曖昧・不明確な場合（質問して明確にする）:
{"type":"question","message":"質問内容"}
```

### handleThreadMessage のレスポンス分岐

| `type` | 動作 |
|--------|------|
| `proposal` | diff + OK/NG ボタン表示、updated を pending に保存 |
| `question` | テキスト返信のみ（ボタンなし）。ユーザーの回答は再度 `thread_message` として届く |

---

## KV に保存されるデータ

```
["sessions", "1234567890.123456"]      → "react-expert"              （育成セッション）
["skills", "react-expert"]              → "---\nname: react-expert..."  （SKILL.md 全体）
["pending", "1234567890.123456"]        → "---\nname: react-expert..."  （OK待ち: 適用後の SKILL.md 全体）
```

---

## 実装ステップ

### Step 1: train コマンドでスレッド作成（完了）
- SkillStore port + DenoKvSkillStore adapter
- SessionStore port + DenoKvSessionStore adapter
- parseSlackEvent に threadTs 追加
- handleTrainStart, handleTrainInThread, handleTrainStatus
- createApp パターンへのリファクタ
- 責務分離（core/train.ts, core/apikey.ts）

### Step 2: スレッド返信 → Claude 差分提案（完了）
- Llm port に chat 追加 + ClaudeLlm に実装
- parseSlackEvent に thread_message 追加
- Messenger に replyInThread 追加
- PendingStore port + DenoKvPendingStore adapter
- Core: handleThreadMessage
- Claude レスポンスの分岐: proposal（提案 + OK/NG）/ question（質問のみ）
- コードブロック記法（` ```json ``` `）の除去処理
- Slack リトライの無視（`x-slack-retry-num` ヘッダー判定）
- Slack 側: Event Subscriptions に `message.channels` + `message.groups` 設定済み

### Step 3: OK/NG → 保存 or スキップ（完了）
- parseSlackInteraction に train_confirm 追加（`train_ok` / `train_ng`）
- Core: handleTrainConfirm — OK → pending → skillStore 保存 / NG → pending 破棄

### show コマンド（完了）
- `show スキル名` — 指定スキルの SKILL.md を表示（チャンネル / スレッド）
- `show`（スキル名省略）— スレッド内ではセッションのスキルを表示
- Core: handleShowSkill

### その他の改善（完了）
- 全角スペース対応（parseCommand で全角→半角変換）
- buildTrainGuide 簡素化（「育成セッションを開始します」に統一）
- `parseSlackEvent` でメンション含むメッセージを `thread_message` から除外（show 等のコマンドが育成入力として二重処理される問題の修正）
- OK/NG ボタン押下後に `chat.update` でボタンを結果テキストに差し替え（Messenger に `updateMessage` 追加）
