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
- `channels:history` — パブリックチャンネルのメッセージ読み取り
- `groups:history` — プライベートチャンネルのメッセージ読み取り

## 4. Install App

1. 左メニュー「Install App」→「Install to Workspace」
2. 権限を許可
3. **Bot User OAuth Token**（`xoxb-...`）をコピーして控える

## 5. Signing Secret（リクエスト署名検証）

Webhook が Slack からのリクエストであることを検証するために使用する。

1. 左メニュー「Basic Information」→「App Credentials」セクション
2. **Signing Secret** をコピー
3. Deno Deploy の環境変数に設定:
   - Name: `SLACK_SIGNING_SECRET`
   - Value: コピーした Signing Secret

※ これがないと、誰でも `/webhook/slack` に POST できてしまう

## 6. Event Subscriptions

※ サーバーがデプロイ済みであること（challenge レスポンスが必要）

1. 左メニュー「Event Subscriptions」→ Enable Events を **ON**
2. Request URL に `https://slack-claud-55.deno.dev/webhook/slack` を入力
3. Slack が challenge を送信 → サーバーが応答 → ✅ Verified と表示される
4. 「Subscribe to bot events」セクションで「Add Bot User Event」をクリック
5. `app_mention` を検索して追加
6. `message.channels` を検索して追加（パブリックチャンネルのスレッド内返信受信用）
7. `message.groups` を検索して追加（プライベートチャンネルのスレッド内返信受信用）
8. ページ下部の「Save Changes」を押す
9. 権限変更後は **Reinstall to Workspace** が必要

## 7. Interactivity & Shortcuts（ボタン・Modal）

APIキー登録などでボタン押下や Modal 送信を受け取るために必要。

1. 左メニュー「Interactivity & Shortcuts」→ Interactivity を **ON**
2. Request URL に `https://slack-claud-55.deno.dev/webhook/slack/interaction` を入力
3. 「Save Changes」を押す

## 8. 動作確認

1. Slack でボットをチャンネルに招待: `/invite @SkillBot`
2. `@SkillBot こんにちは` とメンション
3. Deno Deploy のログにイベントが表示されればOK
