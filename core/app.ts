import type { Messenger } from "./ports.ts";

export async function handleMention(
  messenger: Messenger,
  channel: string,
  text: string,
): Promise<void> {
  await messenger.reply(channel, `受け取りました: ${text}`);
}
