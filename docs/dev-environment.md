# 開発用環境設定

## VSCode / Cursor 設定

`.vscode/settings.json` で以下を設定:

- Deno拡張を有効化（`deno.enable: true`）
- Deno Lint を有効化（`deno.lint: true`）
- 保存時に自動フォーマット（`editor.formatOnSave: true`）
- フォーマッターは Deno に統一（`denoland.vscode-deno`）

### 対象ファイルタイプ
- TypeScript
- JSON

## .gitignore

- `.deno/` — Deno のキャッシュディレクトリ
- `.DS_Store` / `Thumbs.db` — OS が生成するファイル

## 参考

- 設定は [webshoten/deno_bff_graphql_react](https://github.com/webshoten/deno_bff_graphql_react) を参考にし、本プロジェクトに必要な部分のみ採用
- `import_map.json` は Deno 2.x では `deno.json` の `imports` に統合されているため不要
