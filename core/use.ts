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
    const skills = await skillStore.list();
    const msg = skills.length > 0
      ? `*${skillName}* はまだ作成されていません。\n\n利用可能なスキル:\n${skills.map((s) => `• ${s}`).join("\n")}`
      : `*${skillName}* はまだ作成されていません。スキルが1つもありません。\`train スキル名\` で作成してください。`;
    await messenger.reply(channel, msg, ts);
    return;
  }

  await useSessionStore.start(ts, { skillName, startTs: ts });
  await messenger.reply(channel, `*${skillName}* モードで会話を開始します。`, ts);
}
