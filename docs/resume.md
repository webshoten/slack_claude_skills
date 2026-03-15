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
  - Claude レスポンスの `proposal`/`question` 分岐
  - コードブロック記法（` ```json ``` `）の除去処理
  - Slack リトライの無視（`x-slack-retry-num` ヘッダー判定）
- **育成モード Step 3: OK/NG → 保存 or スキップ**
  - `parseSlackInteraction` に `train_confirm` 追加（`train_ok` / `train_ng`）
  - `handleTrainConfirm` — OK → pending から取り出して skillStore に保存 / NG → pending 破棄
- **show コマンド**
  - `show スキル名` — 指定スキルの SKILL.md を表示（チャンネル / スレッド）
  - `show`（スキル名省略）— スレッド内ではセッションのスキルを表示
- **全角スペース対応**（`parseCommand` で全角→半角変換）
- **メンション二重処理の修正** — `parseSlackEvent` でメンション含むメッセージを `thread_message` から除外
- **OK/NG ボタン差し替え** — 押下後に `chat.update` でボタンを結果テキストに差し替え（`Messenger.updateMessage` 追加）
- **育成プロンプト改善** — Slack ボットとしての口調指示、YAML/markdown 等の内部用語を避ける
- **実行モード（use コマンド）**（設計: `docs/use.md`、Step 4 のモード切り替えは未実装）
  - `use スキル名` で Sonnet ベースの会話セッション開始
  - train/use セッションを KV キーで分離（`train_sessions` / `use_sessions`）
  - `conversations.replies` でスレッド履歴取得、`startTs` 以降のみ使用
  - `Llm.chat` に `model` / `tools` パラメータ追加（train は Haiku、use は Sonnet）
  - `web_fetch` ツール対応（Claude が tool use でウェブページ取得可能、最大10回ループ）
  - Google bot ブロック時の DuckDuckGo 自動フォールバック
  - 取得テキスト 5,000文字切り詰め（レートリミット対策）
  - プロンプトでクロールの最小限実行を指示
- **list コマンド** — `@SkillBot list` でスキル一覧表示
- **`docs/summary.md`** — 全体サマリー（アーキテクチャ・コマンド・KV構造等）

### Slack 側の設定状況
- Event Subscriptions: `app_mention` + `message.channels` + `message.groups`（プライベートチャンネル用）設定済み
- Bot Token Scopes: `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`
- Interactivity: `/webhook/slack/interaction` 設定済み
- 環境変数: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`

---

## 次回やること

### use モード Step 4: スレッド内モード切り替え（`docs/use.md` 参照）
- `handleUseInThread` — 同じスキル（すでにモード）/ 別のスキル（上書き）/ train からの切り替え
- train コマンド実行時に use_sessions を消す処理を train.ts に追加
- use → train → use の交互切り替えが正しく動くことを確認

### アーキテクチャ改善の検討
- `ClaudeLlm.chat` に `web_fetch` の実行まで入っており責務が混在
- ツール実行を別の port（例: `ToolExecutor`）に分離する案あり

---

## 未着手だが設計済み
- テスト戦略（`docs/testing.md`）— ユニットテスト + リグレッションチェックリスト + CI/CD
- Canvas 対応（SkillStore の adapter 差し替え）
- 画像対応（Post-MVP）
