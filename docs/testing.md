# テスト戦略

## 1. ユニットテスト（自動）

`deno test --unstable-kv` で実行。

### 対象

| テスト対象 | 方法 |
|-----------|------|
| `handleMention` | InMemoryMessenger / InMemoryMessageStore を差し込み |
| `parseSlackEvent` | JSON を入力して parse 結果を検証 |
| 署名検証 | 既知の signing secret + body で検証 |
| `DenoKvBrowser` list/delete | ローカル KV で実際に read/write |
| set-key 分岐（今後） | InMemory adapter でコアロジックを検証 |

### テスト用 adapter

`InMemoryMessenger`, `InMemoryMessageStore` 等を用意し、core ロジックを外部通信なしでテスト。

---

## 2. リグレッションチェックリスト（手動）

リリース前に手動確認する項目。

### Slack 連携
- [ ] `@SkillBot` にメンションして応答が返る
- [ ] メンション内容が Deno KV に保存される
- [ ] 不正な署名のリクエストが拒否される

### Admin ページ
- [ ] `/admin/kv` に Basic 認証（admin / ADMIN_PASSWORD）でアクセスできる
- [ ] 認証失敗時に 401 が返る
- [ ] KV エントリが一覧表示される
- [ ] エントリの削除ができる
- [ ] APIキーの値がマスク表示される

### APIキー登録（今後）
- [ ] `@SkillBot set-key` でボタン付き Ephemeral メッセージが表示される
- [ ] ボタン押下で Modal が開く
- [ ] Modal から APIキーを送信すると KV に保存される
- [ ] 保存されたキーが `/admin/kv` で確認できる（マスク表示）
- [ ] `/admin/kv` からキーを削除できる

---

## 3. CI/CD

GitHub Actions でテスト → デプロイを一本化する。

### 構成

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: deno test --unstable-kv
      - uses: denoland/deployctl@v1
        with:
          project: slack-claud-55
          entrypoint: main.ts
```

### ポイント
- Deno Deploy の GitHub Integration を外し、deployctl に置き換える
- テストが落ちればデプロイされない
- 環境変数は Deno Deploy 管理画面のものがそのまま使われる
