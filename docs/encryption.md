# APIキー暗号化・復号の設計

## 概要

ユーザーの Claude APIキーを Deno KV に保存する際、AES-GCM で暗号化する。
Deno に組み込みの Web Crypto API（`crypto.subtle`）を使う。外部ライブラリ不要。

---

## アルゴリズム: AES-GCM (256bit)

- **AES-GCM** = AES + Galois/Counter Mode
- 暗号化と改ざん検知を同時に行う（認証付き暗号）
- Web Crypto API でネイティブサポート

---

## 登場する要素

| 要素 | 説明 | 生成方法 |
|------|------|----------|
| **マスターキー** | 暗号化・復号に使う秘密鍵（256bit） | 事前に生成し、環境変数 `ENCRYPTION_KEY` に base64 で保存 |
| **IV（初期化ベクトル）** | 暗号化のたびに生成するランダム値（12byte） | `crypto.getRandomValues(new Uint8Array(12))` |
| **平文** | ユーザーの Claude APIキー（例: `sk-ant-api03-...`） | ユーザーが Modal で入力 |
| **暗号文** | AES-GCM で暗号化されたバイナリ | `crypto.subtle.encrypt()` の戻り値 |

---

## 暗号化フロー（保存時）

```
平文（APIキー）
  ↓ TextEncoder.encode()
バイト列（Uint8Array）
  ↓ crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data)
暗号文（ArrayBuffer）
  ↓ IV + 暗号文を結合して base64 エンコード
文字列（保存用）
  ↓ Deno KV に保存
["api_keys", slackUserId] → "base64文字列"
```

### コード例

```typescript
async function encrypt(plainText: string, masterKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    encoded,
  );

  // IV(12byte) + 暗号文 を結合して base64 に
  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);

  return btoa(String.fromCharCode(...combined));
}
```

---

## 復号フロー（取得時）

```
KV から取得した base64 文字列
  ↓ base64 デコード
バイト列（IV + 暗号文）
  ↓ 先頭12byte = IV、残り = 暗号文 に分割
  ↓ crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherText)
平文バイト列（ArrayBuffer）
  ↓ TextDecoder.decode()
平文（APIキー）
```

### コード例

```typescript
async function decrypt(stored: string, masterKey: CryptoKey): Promise<string> {
  const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));

  // 先頭12byte が IV
  const iv = bytes.slice(0, 12);
  const cipherText = bytes.slice(12);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    masterKey,
    cipherText,
  );

  return new TextDecoder().decode(plainBuffer);
}
```

---

## マスターキーの準備

### 1. 生成（1回だけ）

```bash
deno eval "
  const key = crypto.getRandomValues(new Uint8Array(32));
  console.log(btoa(String.fromCharCode(...key)));
"
```

32byte のランダム値を base64 で出力。これを `ENCRYPTION_KEY` に設定する。

### 2. 環境変数から CryptoKey に変換（起動時）

```typescript
async function importMasterKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,               // extractable: false（外に取り出せない）
    ["encrypt", "decrypt"],
  );
}
```

---

## KV に保存されるデータ

```
Key:   ["api_keys", "U12345ABC"]
Value: "base64(IV + 暗号文)"   ← 1つの文字列
```

- IV は暗号文と一緒に保存する（IV は秘密にする必要がない）
- 毎回異なる IV を生成するため、同じ平文でも異なる暗号文になる

---

## Slack からの APIキー登録フロー

APIキーはチャット履歴に残さないため、Slack の **Modal**（入力ダイアログ）を使う。

### フロー

```
1. ユーザー: @SkillBot set-key とメンション
2. Bot: 「APIキーを設定」ボタン付きメッセージを投稿（Ephemeral = 本人にだけ見える）
3. ユーザー: ボタンを押す
4. Bot: Modal（入力フォーム）を開く
5. ユーザー: APIキーを入力して送信
6. Bot: Claude API（Haiku, max_tokens:1）でキーの有効性を検証
   → 無効: 保存せず「無効なAPIキーです」と Ephemeral で通知
   → 有効: 暗号化して Deno KV に保存 → 「設定しました（...xxxx）」と Ephemeral で通知
```

### なぜ Modal か

- メッセージでキーを送ると **チャット履歴に平文で残る**
- Modal はサーバーに直接送信され、チャンネルには一切表示されない
- Ephemeral メッセージ（本人にだけ見える）と組み合わせて、他のメンバーにも見えない

### 必要な Slack 設定

1. **Interactivity を ON** にする（api.slack.com/apps → Interactivity & Shortcuts）
2. **Request URL** を設定: `https://slack-claud-55.deno.dev/webhook/slack/interaction`
3. Bot に `chat:write` スコープ（Ephemeral 送信に必要、設定済み）

### 受信するエンドポイント

```
POST /webhook/slack              ← メンションイベント（set-key 検知）
POST /webhook/slack/interaction  ← ボタン押下 / Modal 送信
```

### ボタン付きメッセージの送信（ステップ 2）

```typescript
// chat.postEphemeral で本人にだけ見えるメッセージを送る
await fetch("https://slack.com/api/chat.postEphemeral", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    channel,
    user: userId,
    text: "APIキーを設定してください",
    blocks: [
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "APIキーを設定" },
            action_id: "open_apikey_modal",
          },
        ],
      },
    ],
  }),
});
```

### Modal を開く（ステップ 4）

ボタン押下時に `trigger_id` が送られてくるので、それを使って Modal を開く。

```typescript
await fetch("https://slack.com/api/views.open", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${botToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    trigger_id: payload.trigger_id,
    view: {
      type: "modal",
      callback_id: "apikey_modal",
      title: { type: "plain_text", text: "APIキー設定" },
      submit: { type: "plain_text", text: "保存" },
      blocks: [
        {
          type: "input",
          block_id: "apikey_block",
          element: {
            type: "plain_text_input",
            action_id: "apikey_input",
            placeholder: { type: "plain_text", text: "sk-ant-api03-..." },
          },
          label: { type: "plain_text", text: "Claude APIキー" },
        },
      ],
    },
  }),
});
```

### Modal 送信の処理（ステップ 5〜6）

`callback_id: "apikey_modal"` の `view_submission` イベントで受信。

```typescript
// payload.view.state.values からキーを取得
const apiKey = payload.view.state.values.apikey_block.apikey_input.value;

// 暗号化して KV に保存
await keyVault.save(userId, apiKey);

// Ephemeral で通知
const masked = "..." + apiKey.slice(-4);
await postEphemeral(channel, userId, `APIキーを設定しました（${masked}）`);
```

---

## セキュリティ上のポイント

| 項目 | 対応 |
|------|------|
| IV の再利用禁止 | 暗号化のたびに `crypto.getRandomValues` で新規生成 |
| マスターキーの保護 | 環境変数のみ。コード・KV には保存しない |
| 改ざん検知 | AES-GCM の認証タグにより、復号時に自動検証される |
| admin ページでの表示 | 復号せずマスク表示（`...xxxx`） |

---

## 参考

- [Deno AES Encryption Example](https://docs.deno.com/examples/aes_encryption/)
- [MDN SubtleCrypto.importKey()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey)
- [AES-GCM Gist (Web Crypto API)](https://gist.github.com/chrisveness/43bcda93af9f646d083fad678071b90a)
