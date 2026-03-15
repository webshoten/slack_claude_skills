import type {
  KeyVault,
  Llm,
  LlmMessage,
  LlmTool,
  Messenger,
  SkillStore,
  UseSessionStore,
} from "./ports.ts";

/** use モードで Claude に与えるツール */
const USE_TOOLS: LlmTool[] = [
  {
    name: "web_fetch",
    description: "指定したURLのウェブページを取得します。ウェブ検索、クローリング、ページ内容の取得に使ってください。検索したい場合は Google 等の検索URLを指定できます。",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "取得するURL" },
      },
      required: ["url"],
    },
  },
];

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
  return `あなたは以下のスキルに基づいて動作する専門アシスタントです。
返答は Slack のスレッドに投稿されるため、簡潔にしてください。

## スキル（最優先で従うこと）
${skillContent}

## ツールの使い方
web_fetch ツールでウェブページを取得できます。

**重要: スキルに記載されたサイト・手順・優先順位がある場合、必ずそれに従ってください。スキルに指定のないサイトを使わないでください。**

- 特定サイトを見たい場合: URLを直接指定して取得する
- 検索が必要な場合: https://www.google.com/search?q=キーワード を取得して検索結果を得る（ブロックされた場合は自動で DuckDuckGo にフォールバックされます）
- 複数ページをクロールしたい場合: 取得結果からリンクを拾って順に取得する
- URLが404の場合は推測でリトライせず、まず検索で正しいURLを見つけること
- 必要最小限のページだけ取得すること。大量のクロールはしない
- ユーザーの質問に答えるのに十分な情報が得られたら、それ以上取得せず回答する`;
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
    // ボットのコマンド応答（show出力、モード開始メッセージ、エラー等）は会話履歴に含めない
    if (reply.botId && /モードで会話を開始します|の現在のスキル:\n---|^エラーが発生しました/.test(reply.text)) continue;

    messages.push({
      role: reply.botId ? "assistant" : "user",
      content: reply.text,
    });
  }

  // 履歴に今回のメッセージが含まれていない場合（タイミングの問題）に追加
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content !== text) {
    messages.push({ role: "user", content: text });
  }

  // レートリミット対策: 直近50件に制限（最後のメッセージは必ず含む）
  if (messages.length > 50) {
    messages.splice(0, messages.length - 50);
  }

  const systemPrompt = buildUseSystemPrompt(skillContent);

  let response: string;
  try {
    response = await llm.chat(apiKey, messages, systemPrompt, "claude-sonnet-4-6", USE_TOOLS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await messenger.replyInThread(channel, threadTs, `エラーが発生しました: ${message}`);
    return;
  }

  await messenger.replyInThread(channel, threadTs, response);
}
