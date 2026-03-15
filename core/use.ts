import type {
  Messenger,
  SkillStore,
  UseSessionStore,
} from "./ports.ts";

export async function handleUseStart(
  messenger: Messenger,
  skillStore: SkillStore,
  useSessionStore: UseSessionStore,
  channel: string,
  skillName: string,
  ts: string,
): Promise<void> {
  const content = await skillStore.get(skillName);
  if (!content) {
    await messenger.reply(channel, `*${skillName}* はまだ作成されていません。`, ts);
    return;
  }

  await useSessionStore.start(ts, { skillName, startTs: ts });
  await messenger.reply(channel, `*${skillName}* モードで会話を開始します。`, ts);
}
