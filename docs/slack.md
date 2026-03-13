# Slack 設定

## 1. ワークスペース作成

1. [slack.com/get-started#/createnew](https://slack.com/get-started#/createnew) にアクセス
2. ワークスペース名を入力（例: `skill-bot-dev`）
3. 無料プランでOK

## 2. Slack App 作成

1. [api.slack.com/apps](https://api.slack.com/apps) にアクセス（事前にワークスペースにサインイン済みであること）
2. 「Create New App」→「From scratch」を選択
3. App名: `SkillBot`（任意）、ワークスペース: 作成済みのものを選択

## 3. OAuth & Permissions（Bot Token Scopes）

左メニュー「OAuth & Permissions」→「Scopes」セクションで以下を追加:

- `app_mentions:read` — メンション検知
- `chat:write` — メッセージ送信
- `channels:history` — チャンネルのメッセージ読み取り

## 4. Install App

1. 左メニュー「Install App」→「Install to Workspace」
2. 権限を許可
3. **Bot User OAuth Token**（`xoxb-...`）をコピーして控える

## 5. Event Subscriptions

※ サーバーがデプロイ済みであること（challenge レスポンスが必要）

1. 左メニュー「Event Subscriptions」→ Enable Events を **ON**
2. Request URL に `https://slack-claud-55.deno.dev/webhook/slack` を入力
3. Slack が challenge を送信 → サーバーが応答 → ✅ Verified と表示される
4. 「Subscribe to bot events」セクションで「Add Bot User Event」をクリック
5. `app_mention` を検索して追加
6. ページ下部の「Save Changes」を押す

## 6. 動作確認

1. Slack でボットをチャンネルに招待: `/invite @SkillBot`
2. `@SkillBot こんにちは` とメンション
3. Deno Deploy のログにイベントが表示されればOK
