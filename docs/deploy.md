# デプロイ

## Deno Deploy

### 初回セットアップ

1. [dash.deno.com](https://dash.deno.com) にアクセス
2. 「New Project」を選択
3. GitHubリポジトリ `webshoten/slack_claude_skills` を連携
4. エントリーポイントに `main.ts` を指定
5. デプロイ実行

### 環境変数

1. [dash.deno.com](https://dash.deno.com) → プロジェクト `slack-claud-55` を開く
2. **Settings** → **Environment Variables**
3. 以下を追加:

| Name | Value | 取得元 |
|------|-------|--------|
| `SLACK_BOT_TOKEN` | `xoxb-...` | [api.slack.com/apps](https://api.slack.com/apps) → App → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | 文字列 | [api.slack.com/apps](https://api.slack.com/apps) → App → Basic Information → App Credentials → Signing Secret |
| `ADMIN_PASSWORD` | 任意のパスワード | 自分で決める。/admin/kv の Basic 認証に使用 |
| `ENCRYPTION_KEY` | base64 文字列 | `deno eval "const k=crypto.getRandomValues(new Uint8Array(32));console.log(btoa(String.fromCharCode(...k)))"` で生成 |

### デプロイの仕組み

- GitHub連携により、`main` ブランチにpushすると自動デプロイ
- エントリーポイント: `main.ts`

### URL

- 本番: https://slack-claud-55.deno.dev/

### GitHubリポジトリ

- https://github.com/webshoten/slack_claude_skills
