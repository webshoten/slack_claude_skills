# 環境構築

## Deno

### インストール方法

Homebrewでインストール済み。

```bash
brew install deno
```

### バージョン確認

```bash
deno --version
```

### アップデート

Homebrew経由のため `deno upgrade` は使えない。

```bash
brew upgrade deno
```

### 現在のバージョン

- 2.7.5（2026-03-12にアップデート済み）

## プロジェクト初期化

```bash
deno init
```

生成されるファイル:
- `deno.json` — 設定ファイル（タスク、インポートマップ）
- `main.ts` — エントリーポイント
- `main_test.ts` — テストファイル

## エディタ

### VSCode / Cursor

Deno拡張をインストール:
- 拡張機能: `denoland.vscode-deno`
- Marketplace: [Deno for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
