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
5. Bot: SKILL.md をシステムプロンプト + startTs 以降の会話履歴で Claude API に送信 → 回答
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
| スキルが存在しない | 「スキル名 はまだ作成されていません」 |

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
| Claude の役割 | 育成アシスタント（diff 提案） | スキルに基づく回答者 |
| OK/NG ボタン | あり | なし |
| pending 保存 | あり | なし |
| 会話履歴 | 不要（1ターンずつ独立） | 必要（startTs 以降の文脈を維持） |

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

## システムプロンプト（use 用）

```
あなたは以下のスキルに基づいて応答するアシスタントです。
スキルに記載されたルール・知識・方針に従って回答してください。

## スキル
{SKILL.md の内容}
```

---

## 必要な変更

### core/ports.ts
- `SessionStore` はインターフェース変更なし（train 用のまま）
- `UseSessionStore` インターフェースを新規追加
- `Messenger` に `getThreadReplies` 追加

```typescript
// train 用（既存のまま）
interface SessionStore {
  start(threadTs: string, skillName: string): Promise<void>;
  get(threadTs: string): Promise<string | null>;
  end(threadTs: string): Promise<void>;
}

// use 用（新規）
type UseSession = { skillName: string; startTs: string };

interface UseSessionStore {
  start(threadTs: string, session: UseSession): Promise<void>;
  get(threadTs: string): Promise<UseSession | null>;
  end(threadTs: string): Promise<void>;
}

// Messenger に追加
type ThreadMessage = { user: string; text: string; ts: string; botId?: string };

interface Messenger {
  // 既存メソッド省略
  getThreadReplies(channel: string, threadTs: string): Promise<ThreadMessage[]>;
}
```

### adapters/kv/session-store.ts
- KV キーを `["sessions", ...]` → `["train_sessions", ...]` にリネーム
- 後方互換: 旧キーからの移行は不要（デプロイ時にセッションはリセットされて問題ない）

### adapters/kv/use-session-store.ts（新規）
- `DenoKvUseSessionStore` — `["use_sessions", threadTs]` に UseSession を保存

### adapters/slack/messenger.ts
- `getThreadReplies(channel, threadTs)` — `conversations.replies` を呼び出し
- 現在の `slackApi` は `void` を返すので、レスポンスを返す版（`slackApiJson` 等）を追加

### core/use.ts（新規）
- `handleUseStart` — スキル存在確認 → use セッション開始 → 開始メッセージ
- `handleUseInThread` — スレッド内での use コマンド（切り替え等）
- `handleUseMessage` — スレッド内メッセージ → 会話履歴取得 → Claude API → 回答

### core/app.ts
- `handleMention` に `use` コマンドのルーティング追加
- `handleThreadMessage` で use_sessions → train_sessions の順にチェックして分岐

---

## 既存コマンドとの関係

### show コマンド

use セッション中に `show` を実行しても問題なし。show は独立した処理（スキル内容を表示するだけ）で、セッション状態に影響しない。

### list コマンド（未実装）

use とは独立。スキル一覧を表示するだけ。

---

## 実装ステップ

### Step 1: セッションのリネームと UseSessionStore 追加
- 既存 SessionStore の KV キーを `["train_sessions", ...]` にリネーム
- `UseSessionStore` インターフェース + `DenoKvUseSessionStore` を追加
- `createApp` の ports に `useSessionStore` を追加
- 既存の動作が壊れないことを確認

### Step 2: use コマンドの基本フロー
- `core/use.ts` 新規作成
- `handleUseStart` — スキル存在確認 → use セッション開始 → 開始メッセージ
- `app.ts` に use コマンドのルーティング追加

### Step 3: スレッド内会話
- Messenger に `getThreadReplies` 追加（`conversations.replies`）
- `handleUseMessage` — 会話履歴取得（startTs 以降 + メンション除外）→ Claude API → 回答
- `app.ts` の `handleThreadMessage` で use_sessions → train_sessions の順に分岐

### Step 4: スレッド内でのモード切り替え
- `handleUseInThread` — 同じスキル（すでにモード）/ 別のスキル（上書き）/ train からの切り替え
- train コマンド実行時に use_sessions を消す処理を train.ts に追加
- use → train → use の交互切り替えが正しく動くことを確認
