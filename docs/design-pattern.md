# デザインパターン

## Ports & Adapters（ヘキサゴナルアーキテクチャ）

コアロジックが外部サービスを直接知らない。
Port（インターフェース）を通じてやり取りし、Adapterを差し替えるだけでインフラを変更できる。

### なぜこのパターンか

- インフラ（Slack, Deno KV, Claude API）を差し替えやすくしたい
- テスト時にMockに差し替えたい
- 将来の拡張（Discord対応, 別LLM等）に備えたい

### Ports（インターフェース）

| Port | 役割 |
|------|------|
| Messenger | チャット基盤（メッセージ受信・返信・モーダル表示） |
| SkillStore | スキルの保存・取得・削除 |
| KeyVault | APIキーの暗号化保存・取得・削除 |
| LLM | AI（チャット応答） |

### Adapters（実装）

| Port | 本番 | テスト用 |
|------|------|---------|
| Messenger | SlackMessenger | CLIMessenger |
| SkillStore | SlackCanvasStore | FileStore |
| KeyVault | DenoKvVault（AES暗号化） | InMemoryVault |
| LLM | ClaudeLLM | MockLLM |

### 組み立て（DI）

```typescript
// 本番
const app = createApp({
  messenger: new SlackMessenger(slackToken),
  skillStore: new SlackCanvasStore(slackToken),
  keyVault: new DenoKvVault(encryptionKey),
  llm: new ClaudeLLM(),
})

// テスト
const app = createApp({
  messenger: new CLIMessenger(),
  skillStore: new FileStore("./skills"),
  keyVault: new InMemoryVault(),
  llm: new MockLLM(),
})
```

### 開発方針

- 最初は直書きで実装する（動くものを優先）
- 動いてからPorts & Adaptersにリファクタする
- 実感を持って設計パターンを理解できるようにする
