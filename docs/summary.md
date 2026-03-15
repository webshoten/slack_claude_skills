# SkillBot サマリー

## 概要

Slack 上で AI スキルを育成・実行するボット。ユーザーが自然言語でスキル（ナレッジ）を教え、それを使って Claude と会話できる。

---

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `@SkillBot` | ヘルプ表示 + APIキー設定状況 |
| `@SkillBot set-key` | Claude APIキー登録（Modal） |
| `@SkillBot train スキル名` | スキル育成セッション開始 |
| `@SkillBot use スキル名` | スキル実行セッション開始 |
| `@SkillBot show スキル名` | スキル内容の表示 |
| `@SkillBot list` | スキル一覧表示 |

---

## 2つのモード

### train（育成）

スキルの内容を対話的に作成・編集する。

- モデル: Haiku（軽量・高速）
- Claude が変更を提案 → OK/NG ボタンで確認 → 保存
- 1ターンずつ独立（会話履歴不要）
- 詳細: `docs/training.md`

### use（実行）

保存済みスキルをシステムプロンプトとして Claude と会話する。

- モデル: Sonnet（高品質な回答）
- 会話履歴を維持（スレッド内の文脈を引き継ぐ）
- `web_fetch` ツールでウェブページ取得・クロール可能
- train → use のスレッド内切り替え対応（startTs で履歴を分離）
- 詳細: `docs/use.md`

---

## アーキテクチャ

Ports & Adapters（ヘキサゴナル）パターン。

### core（ビジネスロジック）

| ファイル | 責務 |
|---------|------|
| `core/app.ts` | `createApp` + コマンドルーティング |
| `core/train.ts` | 育成ロジック |
| `core/use.ts` | 実行ロジック |
| `core/apikey.ts` | APIキーロジック |
| `core/ports.ts` | 全 Port インターフェース定義 |

### adapters（外部接続）

| ファイル | 責務 |
|---------|------|
| `adapters/slack/event.ts` | Slack イベントのパース |
| `adapters/slack/interaction.ts` | Slack ボタン/Modal のパース |
| `adapters/slack/messenger.ts` | Slack API 呼び出し |
| `adapters/slack/verify.ts` | 署名検証 |
| `adapters/llm/claude.ts` | Claude API 呼び出し + tool use ループ |
| `adapters/kv/session-store.ts` | train セッション（Deno KV） |
| `adapters/kv/use-session-store.ts` | use セッション（Deno KV） |
| `adapters/kv/skill-store.ts` | スキル保存（Deno KV） |
| `adapters/kv/pending-store.ts` | OK待ち一時データ（Deno KV） |
| `adapters/kv/vault.ts` | APIキー暗号化保存（Deno KV + AES-GCM） |
| `adapters/kv/message-store.ts` | メッセージ保存（Deno KV） |
| `adapters/kv/browser.ts` | KV 管理用ブラウザ |
| `adapters/kv/admin.ts` | 管理ページ |

### エントリポイント

- `main.ts` — Hono サーバー + DI 組み立て + ルーティング

---

## KV データ構造

```
["train_sessions", threadTs]  → "スキル名"
["use_sessions", threadTs]    → { skillName, startTs }
["skills", name]              → "SKILL.md 全体"
["pending", threadTs]         → "OK待ちの SKILL.md"
["messages", channel, ts]     → { user, text }
["vault", userId]             → { encrypted, iv }（APIキー）
```

---

## 技術スタック

- **ランタイム**: Deno 2.7.5
- **フレームワーク**: Hono
- **デプロイ**: Deno Deploy（https://slack-claud-55.deno.dev/）
- **データストア**: Deno KV
- **AI**: Claude API（train: Haiku, use: Sonnet）
- **暗号化**: Web Crypto API（AES-GCM）

---

## Slack 設定

- Event Subscriptions: `app_mention` + `message.channels` + `message.groups`
- Bot Token Scopes: `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`
- Interactivity: `/webhook/slack/interaction`
- 環境変数: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`

---

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| `docs/summary.md` | 本ドキュメント（全体サマリー） |
| `docs/resume.md` | 実装状況と次回やること |
| `docs/training.md` | 育成モードの詳細設計 |
| `docs/use.md` | 実行モードの詳細設計 |
| `docs/testing.md` | テスト戦略 |
| `docs/setup.md` | セットアップ手順 |
| `docs/slack.md` | Slack 設定 |
| `docs/tech-stack.md` | 技術選定 |
| `docs/design-pattern.md` | 設計パターン |
| `docs/deploy.md` | デプロイ手順 |
| `docs/encryption.md` | 暗号化の設計 |
| `docs/dev-environment.md` | 開発環境 |
