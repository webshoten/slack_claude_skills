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
2. Bot: スレッドを作成 → ガイドメッセージを投稿
3. Bot: セッションを KV に記録（thread_ts → スキル名）
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
2. Bot: スレッドを作成 → 現在の SKILL.md の内容を表示
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

### 操作の種類

ユーザーは自然言語でスレッドに書くだけ。Claude API が既存 SKILL.md と照らし合わせて判断する。

| 操作 | ユーザー入力例 | Claude の提案 |
|------|--------------|-------------|
| 追加 | 「状態管理はZustandを推奨」 | `+ 状態管理はZustandを推奨（Redux不要な場合）` |
| 編集 | 「ZustandじゃなくてJotaiにして」 | `- 状態管理はZustandを推奨` → `+ 状態管理はJotaiを推奨` |
| 削除 | 「Server Componentsのルール消して」 | `- Server Componentsをデフォルトで使う` |

追加・編集・削除を区別するロジックは不要。Claude API に既存 SKILL.md を丸ごとコンテキストとして渡すので、Claude が適切に判断する。

---

## 必要な Port

### SkillStore（新規）

スキルは全員共有（userId なし）。

```typescript
interface SkillStore {
  get(name: string): Promise<string | null>;
  save(name: string, content: string): Promise<void>;
  list(): Promise<string[]>;
  delete(name: string): Promise<void>;
}
```

- `get` で既存 SKILL.md を取得（Claude API のコンテキストに使う）
- `save` で SKILL.md を丸ごと上書き保存（差分適用後の全体）
- MVP では Deno KV に保存。Post-MVP で Slack Canvas に移行

### Llm（既存を拡張）

```typescript
interface Llm {
  validate(apiKey: string): Promise<boolean>;
  chat(apiKey: string, messages: Message[], systemPrompt: string): Promise<string>;
}
```

`chat` を追加。ユーザーの APIキーで Claude API を呼ぶ。

### SessionStore（新規）

育成セッションの状態を管理する。

```typescript
interface SessionStore {
  start(threadTs: string, skillName: string): Promise<void>;
  get(threadTs: string): Promise<string | null>;  // スキル名を返す
  end(threadTs: string): Promise<void>;
}
```

KV キー: `["sessions", threadTs]` → スキル名

### Messenger（既存を拡張）

スレッド作成時に投稿の `ts` を返す必要がある（セッション管理に使う）。

```typescript
// 追加
startThread(channel: string, text: string): Promise<string>;  // 戻り値は thread_ts
replyInThread(channel: string, threadTs: string, text: string, blocks?: unknown[]): Promise<void>;
```

- `startThread`: チャンネルにメッセージを投稿し、Slack API レスポンスから `ts` を返す
- `replyInThread`: OK/NG ボタン付きの返信など、スレッド内での投稿に使う

---

## イベント処理

### 新しいイベントタイプ

`message.channels` イベントでスレッド内の返信を受信する。
`parseSlackEvent` に追加:

```typescript
| { kind: "thread_message"; channel: string; user: string; text: string; ts: string; threadTs: string }
```

- `thread_ts` があり `bot_id` がない → ユーザーからのスレッド返信
- Bot 自身のメッセージは無視する（無限ループ防止）

### Interaction（OK/NG ボタン）

`parseSlackInteraction` に追加:

```typescript
| { kind: "train_confirm"; approved: boolean; threadTs: string; channel: string; user: string }
```

- `action_id: "train_ok"` → approved: true
- `action_id: "train_ng"` → approved: false

---

## Core ロジック

### handleTrainStart

```
train コマンド受信
  → スキル名を取得
  → SkillStore.get(name) で既存スキルの有無を確認
  → messenger.startThread() でチャンネルにメッセージを投稿（スレッドの親）
    - 新規: ガイドメッセージ
    - 既存: 現在の SKILL.md を表示
  → 戻り値の ts を thread_ts として使用
  → SessionStore.start(ts, skillName) で KV に記録
  → 以降、ユーザーがこのスレッドに返信すると thread_ts 付きイベントで受信
```

### handleThreadMessage

```
スレッド内メッセージ受信
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

### handleTrainConfirm

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
{既存の内容。新規の場合は空}

## SKILL.md の形式
- YAML frontmatter（name, description）+ マークダウン本文
- セクション構成は自由。内容に応じて適切に構成する
- 簡潔に、要点のみ記述する

## あなたの役割
- ユーザーの入力を解釈し、SKILL.md への変更を提案する
- 追加・編集・削除を自然言語から判断する
- 既存の内容と重複しないようにする
- ユーザーの意図が曖昧な場合は、最も自然な解釈で提案する

## 出力形式
以下の2つをJSON形式で返してください:
1. "diff": 変更の説明（ユーザーに見せる差分表示）
2. "updated": 変更適用後の SKILL.md 全体（frontmatter 含む）

説明や前置きは不要。JSONのみ出力。
```

---

## KV に保存されるデータ

```
["sessions", "1234567890.123456"]      → "react-expert"              （育成セッション）
["skills", "react-expert"]              → "---\nname: react-expert..."  （SKILL.md 全体）
["pending", "1234567890.123456"]        → "---\nname: react-expert..."  （OK待ち: 適用後の SKILL.md 全体）
```

---

## 実装順

1. `SkillStore` port + `DenoKvSkillStore` adapter
2. `SessionStore` port + `DenoKvSessionStore` adapter
3. `Messenger` port に `startThread` / `replyInThread` 追加 + `SlackMessenger` に実装
4. `Llm` port に `chat` 追加 + `ClaudeLlm` に実装
5. `parseSlackEvent` に `thread_message` 追加
6. `parseSlackInteraction` に `train_confirm` 追加
7. Core: `handleTrainStart`, `handleThreadMessage`, `handleTrainConfirm`
8. `main.ts` にワイヤリング
