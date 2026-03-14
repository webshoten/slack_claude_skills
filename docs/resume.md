# 次回やること

## 現在の状態（2026-03-13 時点）

- Deno 2.7.5 インストール済み
- Hono で Hello World デプロイ済み（https://slack-claud-55.deno.dev/）
- GitHub リポジトリ作成済み（https://github.com/webshoten/slack_claude_skills）
- Slack ワークスペース作成済み
- **Slack App 作成済み**（api.slack.com/apps から作成）
- **OAuth & Permissions 設定済み**（app_mentions:read, chat:write, channels:history）
- **Install App 済み**（Bot User OAuth Token 取得済み）
- main.ts に `/webhook/slack` エンドポイント追加済み（challenge 対応含む）**← 未 push**

## 次回: コード push → Event Subscriptions 設定 → 動作確認

### やること

1. **main.ts を push する**
   - challenge 対応の `/webhook/slack` エンドポイントが追加済み
   - push すれば Deno Deploy に自動デプロイされる

2. **Slack の Event Subscriptions を設定する**（docs/slack.md のステップ 5 参照）
   - Enable Events を ON
   - Request URL: `https://slack-claud-55.deno.dev/webhook/slack`
   - ✅ Verified が表示されることを確認
   - 「Subscribe to bot events」→ `app_mention` を追加
   - Save Changes

3. **動作確認**
   - Slack でボットをチャンネルに招待: `/invite @SkillBot`
   - `@SkillBot こんにちは` とメンション
   - Deno Deploy のログにイベントが表示されればOK

### 目標

```
Slack投稿（メンション） → Deno受信（ログに表示）
```

これが確認できたら、次は KV 保存 → /admin/kv 表示へ進む。
