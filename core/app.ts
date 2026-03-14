import type { KeyVault, Llm, MessageStore, Messenger } from "./ports.ts";

/** メンションのテキストからBot名部分を除去してコマンドを取り出す */
function parseCommand(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

export async function handleMention(
  messenger: Messenger,
  store: MessageStore,
  vault: KeyVault,
  channel: string,
  user: string,
  text: string,
  ts: string,
): Promise<void> {
  await store.save(channel, user, text, ts);

  const command = parseCommand(text);

  if (command === "set-key") {
    await messenger.promptApiKeySetup(channel, user);
    return;
  }

  // set-key 以外はすべて APIキー必須
  const apiKey = await vault.get(user);

  // コマンドなし → ヘルプ表示
  if (command === "") {
    const keyStatus = apiKey
      ? `設定済み（...${apiKey.slice(-4)}）`
      : "未設定";
    const help = [
      `APIキー: ${keyStatus}`,
      "",
      "コマンド:",
      "• set-key — APIキー登録",
      "• train スキル名 — スキル育成",
      "• use スキル名 — スキル実行",
      "• list — スキル一覧",
    ].join("\n");
    await messenger.reply(channel, help, ts);
    return;
  }

  // APIキー未登録なら設定を促す
  if (!apiKey) {
    await messenger.promptApiKeySetup(channel, user);
    return;
  }

  // TODO: train, use, list の実装
  await messenger.reply(channel, `受け取りました: ${text}`);
}

export async function handleApiKeyButton(
  messenger: Messenger,
  triggerId: string,
  channel: string,
): Promise<void> {
  await messenger.openApiKeyForm(triggerId, channel);
}

export async function handleApiKeySave(
  vault: KeyVault,
  llm: Llm,
  messenger: Messenger,
  userId: string,
  channel: string,
  apiKey: string,
): Promise<void> {
  const valid = await llm.validate(apiKey);
  if (!valid) {
    await messenger.replyEphemeral(channel, userId, "無効なAPIキーです。確認して再度お試しください。");
    return;
  }

  await vault.save(userId, apiKey);
  const masked = "..." + apiKey.slice(-4);
  await messenger.replyEphemeral(channel, userId, `APIキーを設定しました（${masked}）`);
}
