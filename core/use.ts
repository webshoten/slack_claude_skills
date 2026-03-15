import type {
  KeyVault,
  Llm,
  LlmMessage,
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

/** use 用システムプロンプトを生成 */
function buildUseSystemPrompt(skillContent: string): string {
  return `以下のスキルに基づいて応答してください。
スキルに記載されたルール・知識・方針に従い、ユーザーの質問や依頼に対応してください。
あなたは Claude です。Claude としての能力はすべて使えます。
返答は Slack のスレッドに投稿されるため、簡潔にしてください。

## スキル
${skillContent}`;
}

export async function handleUseMessage(
  messenger: Messenger,
  skillStore: SkillStore,
  useSessionStore: UseSessionStore,
  keyVault: KeyVault,
  llm: Llm,
  channel: string,
  user: string,
  text: string,
  threadTs: string,
): Promise<void> {
  const session = await useSessionStore.get(threadTs);
  if (!session) return;

  const apiKey = await keyVault.get(user);
  if (!apiKey) {
    await messenger.promptApiKeySetup(channel, user, threadTs);
    return;
  }

  const skillContent = await skillStore.get(session.skillName);
  if (!skillContent) {
    await messenger.replyInThread(channel, threadTs, `*${session.skillName}* が見つかりませんでした。`);
    return;
  }

  // スレッドの会話履歴を取得し、startTs 以降だけ使う
  const replies = await messenger.getThreadReplies(channel, threadTs);
  const messages: LlmMessage[] = [];
  for (const reply of replies) {
    // startTs 以前のメッセージは除外
    if (reply.ts <= session.startTs) continue;
    // メンション（コマンド）は会話履歴に含めない
    if (/<@[A-Z0-9]+>/.test(reply.text)) continue;
    // 今回のメッセージは最後に user として追加するので除外
    if (reply.ts === text) continue;

    messages.push({
      role: reply.botId ? "assistant" : "user",
      content: reply.text,
    });
  }

  // 今回のメッセージを追加
  messages.push({ role: "user", content: text });

  const systemPrompt = buildUseSystemPrompt(skillContent);

  let response: string;
  try {
    response = await llm.chat(apiKey, messages, systemPrompt, "claude-sonnet-4-6");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await messenger.replyInThread(channel, threadTs, `エラーが発生しました: ${message}`);
    return;
  }

  await messenger.replyInThread(channel, threadTs, response);
}
