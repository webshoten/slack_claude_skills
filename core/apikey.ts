import type { KeyVault, Llm, Messenger } from "./ports.ts";

export async function handleApiKeyButton(
  messenger: Messenger,
  triggerId: string,
  channel: string,
): Promise<void> {
  await messenger.openApiKeyForm(triggerId, channel);
}

export async function handleApiKeySave(
  messenger: Messenger,
  keyVault: KeyVault,
  llm: Llm,
  userId: string,
  channel: string,
  apiKey: string,
): Promise<void> {
  const valid = await llm.validate(apiKey);
  if (!valid) {
    await messenger.replyEphemeral(
      channel,
      userId,
      "無効なAPIキーです。確認して再度お試しください。",
    );
    return;
  }

  await keyVault.save(userId, apiKey);
  const masked = "..." + apiKey.slice(-4);
  await messenger.replyEphemeral(
    channel,
    userId,
    `APIキーを設定しました（${masked}）`,
  );
}
