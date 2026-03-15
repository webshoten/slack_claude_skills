# 次回やること

## 現在の状態（2026-03-14 時点）

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

### Slack 側の設定状況
- Event Subscriptions: 要確認（`app_mention` + `message.channels` が必要）
- Interactivity: 要設定（`/webhook/slack/interaction`）
- 環境変数: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`

---

## 次回: 育成モード（train）の実装

設計は `docs/training.md` に完了済み。実装順:

1. **`SkillStore` port + `DenoKvSkillStore` adapter**
   - スキルは全員共有（userId なし）
   - KV キー: `["skills", スキル名]` → SKILL.md 全体

2. **`SessionStore` port + `DenoKvSessionStore` adapter**
   - KV キー: `["sessions", threadTs]` → スキル名

3. **`Messenger` port に `startThread` / `replyInThread` 追加**
   - `startThread` は Slack API レスポンスから `ts` を返す（セッション管理に必要）

4. **`Llm` port に `chat` 追加 + `ClaudeLlm` に実装**
   - ユーザーの APIキーで Claude API を呼ぶ

5. **`parseSlackEvent` に `thread_message` 追加**
   - `thread_ts` あり + `bot_id` なし → ユーザーからのスレッド返信

6. **`parseSlackInteraction` に `train_confirm` 追加**
   - OK/NG ボタン（`train_ok` / `train_ng`）

7. **Core ロジック**
   - `handleTrainStart` — スレッド作成 + セッション開始
   - `handleThreadMessage` — Claude API で整形 → OK/NG 確認
   - `handleTrainConfirm` — OK で保存 / NG でスキップ

8. **`main.ts` にワイヤリング**

---

## 未着手だが設計済み
- テスト戦略（`docs/testing.md`）— ユニットテスト + リグレッションチェックリスト + CI/CD
- 実行モード（`@SkillBot use スキル名`）
- スキル一覧（`@SkillBot list`）
- 画像対応（Post-MVP）
