# 次回やること

## 現在の状態

- Deno 2.7.5 インストール済み
- Hono で Hello World デプロイ済み（https://slack-claud-55.deno.dev/）
- GitHub リポジトリ作成済み（https://github.com/webshoten/slack_claude_skills）
- Slack ワークスペース作成済み

## 次回: Slack App 作成 → Webhook 受信確認

### やること

1. **Slack App を作成する**
   - https://api.slack.com/apps から「Create New App」
   - 作成したワークスペースに紐づける

2. **Events API を有効化する**
   - Slack からのメッセージを Deno に届けるための設定
   - Webhook URL: `https://slack-claud-55.deno.dev/webhook/slack`

3. **main.ts に Webhook エンドポイントを追加する**
   - `POST /webhook/slack` でSlackからのイベントを受け取る
   - まずは受け取った内容をログに出すだけ

4. **動作確認**
   - Slackで投稿 → Deno のログに表示されることを確認

### 目標

```
Slack投稿 → Deno受信（ログに表示）
```

最初の一歩（`Slack投稿 → Deno受信 → KV保存 → adminページ確認`）のうち、前半部分。
