# デプロイ

## Deno Deploy

### 初回セットアップ

1. [dash.deno.com](https://dash.deno.com) にアクセス
2. 「New Project」を選択
3. GitHubリポジトリ `webshoten/slack_claude_skills` を連携
4. エントリーポイントに `main.ts` を指定
5. デプロイ実行

### デプロイの仕組み

- GitHub連携により、`main` ブランチにpushすると自動デプロイ
- エントリーポイント: `main.ts`

### URL

- 本番: https://slack-claud-55.deno.dev/

### GitHubリポジトリ

- https://github.com/webshoten/slack_claude_skills
