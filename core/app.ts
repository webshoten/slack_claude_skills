import type { KeyVault, Llm, MessageStore, Messenger } from "./ports.ts";

export async function handleMention(
  messenger: Messenger,
  store: MessageStore,
  channel: string,
  user: string,
  text: string,
  ts: string,
): Promise<void> {
  await store.save(channel, user, text, ts);

  if (text.includes("set-key")) {
    await messenger.promptApiKeySetup(channel, user);
    return;
  }

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
