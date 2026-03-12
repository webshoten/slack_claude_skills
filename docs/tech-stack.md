# 技術選定

## ランタイム: Deno

- TypeScriptネイティブ（ビルド不要）
- パーミッションモデル（`--allow-net` 等でセキュリティ確保）
- Deno KV 組み込み（外部DB不要）
- Deno Deploy でそのままホスティング可能

### 選定理由
- TypeScript + ストレージ + ホスティングが一つのエコシステムで完結
- `deno init` ですぐ始められる
- セキュリティモデルがAPIキーを扱うBotと相性が良い

## HTTPフレームワーク: Hono

- 軽量なWebフレームワーク
- Deno / Cloudflare Workers / AWS Lambda / Node.js 等で動作

### 選定理由
- Basic認証ミドルウェアが組み込み（adminページ用）
- ルーティングが簡潔
- `Deno.serve` でも足りるが、adminページのBasic認証が1行で済む
- ポータビリティ（Ports & Adaptersの思想と合致）

### 候補と比較

| | Deno.serve | Hono |
|---|---|---|
| 依存 | ゼロ | 1つ |
| ルーティング | 自前 | 組み込み |
| ミドルウェア | 自前 | Basic認証等あり |
| ポータビリティ | Denoのみ | マルチランタイム（Deno, Lambda, CF Workers等） |

## ストレージ: Deno KV + Slack Canvas

役割で分離:
- **SKILL.md** → Slack Canvas（ユーザーが閲覧・編集できる）
- **APIキー** → Deno KV（AES暗号化、ユーザーに見えない）

### 選定理由
- スキルはオープンに見えていい → Canvas
- APIキーは絶対に見せたくない → 暗号化 + KV
- Deno KVは外部サービス不要、Deno Deployでもそのまま使える

## AI: Claude API

- Anthropic Claude API を fetch で直接呼び出し
- BYOK（Bring Your Own Key）方式: ユーザーが自分のAPIキーを使う

## プラットフォーム: Slack

- メンション方式（@SkillBot）で操作
- APIキー登録は Modal（メッセージ履歴に残らない）
- Slack Canvas でスキルを可視化

## ホスティング: Deno Deploy

- 無料枠あり
- Deno KV 組み込み
- GitHub連携で自動デプロイ
