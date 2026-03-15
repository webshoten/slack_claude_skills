import type { Messenger, SessionStore, SkillStore } from "./ports.ts";

/** スキルの状態に応じたガイドメッセージを生成 */
function buildTrainGuide(
  skillName: string,
  existing: string | null,
  action: "start" | "resume" | "switch",
): string {
  const header = action === "switch"
    ? `*${skillName}* に切り替えました${existing ? "。" : "（新規作成）。"}`
    : action === "resume"
    ? `*${skillName}* の育成を再開します。`
    : `*${skillName}* を新規作成します。`;

  if (existing) {
    return [
      header,
      "",
      "現在のスキル:",
      "---",
      existing,
      "---",
      "",
      "追加・編集・削除したい内容を送ってください。",
    ].join("\n");
  }

  return [
    header,
    "",
    "このスキルに覚えさせたいことを自由に送ってください。",
    "知識、ルール、手順、応答例など、なんでもOKです。",
    "1つずつ送信してください。内容を整形して確認します。",
  ].join("\n");
}

export async function handleTrainStatus(
  messenger: Messenger,
  sessionStore: SessionStore,
  channel: string,
  threadTs: string,
): Promise<void> {
  const currentSkill = await sessionStore.get(threadTs);
  if (currentSkill) {
    await messenger.reply(
      channel,
      `現在 *${currentSkill}* を育成中です。`,
      threadTs,
    );
  } else {
    await messenger.reply(
      channel,
      "スキル名を指定してください。例: `train react-expert`",
      threadTs,
    );
  }
}

export async function handleTrainStart(
  messenger: Messenger,
  skillStore: SkillStore,
  sessionStore: SessionStore,
  channel: string,
  skillName: string,
  ts: string,
): Promise<void> {
  const existing = await skillStore.get(skillName);
  const action = existing ? "resume" : "start";
  await messenger.reply(
    channel,
    buildTrainGuide(skillName, existing, action),
    ts,
  );
  await sessionStore.start(ts, skillName);
}

export async function handleTrainInThread(
  messenger: Messenger,
  skillStore: SkillStore,
  sessionStore: SessionStore,
  channel: string,
  skillName: string,
  threadTs: string,
): Promise<void> {
  const currentSkill = await sessionStore.get(threadTs);

  if (currentSkill === skillName) {
    await messenger.reply(
      channel,
      `すでに *${skillName}* を育成中です。`,
      threadTs,
    );
    return;
  }

  if (currentSkill) {
    // 別のスキルに切り替え
    await sessionStore.start(threadTs, skillName);
    const existing = await skillStore.get(skillName);
    await messenger.reply(
      channel,
      buildTrainGuide(skillName, existing, "switch"),
      threadTs,
    );
  } else {
    // セッションがないスレッドで train → 新規セッション開始
    const existing = await skillStore.get(skillName);
    const action = existing ? "resume" : "start";
    await messenger.reply(
      channel,
      buildTrainGuide(skillName, existing, action),
      threadTs,
    );
    await sessionStore.start(threadTs, skillName);
  }
}
