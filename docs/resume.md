# 次回やること

## 現在の状態（2026-03-15 時点）

### 完了済み
- Deno 2.7.5 + Hono デプロイ済み（https://slack-claud-55.deno.dev/）
- GitHub リポジトリ（https://github.com/webshoten/slack_claude_skills）
- Slack App 作成・OAuth 設定・Install 済み
- `/webhook/slack` エンドポイント（署名検証・challenge 対応・メンション処理）
- `/webhook/slack/interaction` エンドポイント（ボタン押下・Modal 送信）
- `/admin/kv` 管理ページ（Basic認証・一覧表示・削除）
- Deno KV にメッセージ保存（MessageStore port + adapter）
- KvBrowser port + DenoKvBrowser adapter（admin ページ用）
- APIキー暗号化保存（KeyVault port + DenoKvVault adapter、AES-GCM）
- APIキー登録フロー（set-key → Ephemeral ボタン → Modal → バリデーション → KV 保存）
- LLM バリデーション（Llm port + ClaudeLlm adapter、Haiku で有効性確認）
- コマンド体系の実装（set-key / ヘルプ表示 / APIキー未登録チェック）
- ヘルプ表示 + APIキー設定状況（スレッドで返信）
- VSCode デバッグ設定（launch.json）
- Ports & Adapters アーキテクチャ全体
- **`createApp(ports)` パターンでDI整理**（core/app.ts）
- **責務分離**: core/train.ts（育成ロジック）、core/apikey.ts（APIキーロジック）
- **育成モード Step 1: train コマンドでスレッド作成**
  - SkillStore port + DenoKvSkillStore adapter（`["skills", name]`）
  - SessionStore port + DenoKvSessionStore adapter（`["sessions", threadTs]`）
  - `parseSlackEvent` に `threadTs` 追加（スレッド内メンション判定）
  - `handleTrainStart` — ユーザーのメッセージにスレッド返信 + セッション開始
  - `handleTrainInThread` — 同じスキル→育成中表示 / 別スキル→切り替え / セッションなし→新規開始
  - `handleTrainStatus` — スレッド内で `train`（スキル名なし）→ 現在の育成状況表示
- **育成モード Step 2: スレッド返信 → Claude 差分提案**
  - Llm port に `chat` 追加 + ClaudeLlm に実装（Haiku、ユーザーのAPIキーで呼び出し）
  - `parseSlackEvent` に `thread_message` 追加（`bot_id` なし + `thread_ts` あり）
  - Messenger に `replyInThread` 追加（blocks 付きスレッド返信）
  - PendingStore port + DenoKvPendingStore adapter（`["pending", threadTs]`）
  - `handleThreadMessage` — セッション確認 → Claude API → diff + OK/NG ボタン表示 → pending 保存
  - 育成用システムプロンプト（`buildTrainSystemPrompt`）

### Slack 側の設定状況
- Event Subscriptions: `app_mention` + `message.channels` + `message.groups`（プライベートチャンネル用）設定済み
- Bot Token Scopes: `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`
- Interactivity: `/webhook/slack/interaction` 設定済み
- 環境変数: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`

---

## 次回: 育成モード Step 3 — OK/NG → 保存 or スキップ

1. **`parseSlackInteraction` に `train_confirm` 追加**
   - `action_id: "train_ok"` → approved: true
   - `action_id: "train_ng"` → approved: false

2. **Core: `handleTrainConfirm`**（core/train.ts に追加）
   - OK → `pendingStore.get(threadTs)` → `skillStore.save()` → 「反映しました」
   - NG → `pendingStore.delete(threadTs)` → 「スキップしました」

3. **`main.ts` にワイヤリング**

---

## 未着手だが設計済み
- テスト戦略（`docs/testing.md`）— ユニットテスト + リグレッションチェックリスト + CI/CD
- 実行モード（`@SkillBot use スキル名`）
- スキル一覧（`@SkillBot list`）
- 画像対応（Post-MVP）
