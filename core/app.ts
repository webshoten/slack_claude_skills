import type { Messenger, MessageStore } from "./ports.ts";

export async function handleMention(
  messenger: Messenger,
  store: MessageStore,
  channel: string,
  user: string,
  text: string,
  ts: string,
): Promise<void> {
  await store.save(channel, user, text, ts);
  await messenger.reply(channel, `受け取りました: ${text}`);
}
