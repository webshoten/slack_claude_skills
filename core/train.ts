import type {
  KeyVault,
  Llm,
  Messenger,
  PendingStore,
  SessionStore,
  SkillStore,
} from "./ports.ts";

/** 育成ガイドメッセージを生成 */
function buildTrainGuide(
  skillName: string,
  existing: string | null,
  switched?: boolean,
): string {
  const header = switched
    ? `*${skillName}* に切り替えました。`
    : `*${skillName}* の育成セッションを開始します。`;

  const lines = [header];

  if (existing) {
    lines.push(
      "",
      "現在のスキル:",
      "---",
      existing,
      "---",
      "",
      "追加・編集・削除したい内容を送ってください。",
    );
  } else {
    lines.push(
      "",
      "このスキルに覚えさせたいことを自由に送ってください。",
      "1つずつ送信してください。内容を整形して確認します。",
    );
  }

  return lines.join("\n");
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
      "スキル名を指定してください。例: `@SlackBot train react-expert`",
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
  await messenger.reply(
    channel,
    buildTrainGuide(skillName, existing),
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
      buildTrainGuide(skillName, existing, true),
      threadTs,
    );
  } else {
    // セッションがないスレッドで train → 新規セッション開始
    const existing = await skillStore.get(skillName);
    await messenger.reply(
      channel,
      buildTrainGuide(skillName, existing),
      threadTs,
    );
    await sessionStore.start(threadTs, skillName);
  }
}

/** 育成用システムプロンプトを生成 */
function buildTrainSystemPrompt(
  skillName: string,
  existing: string | null,
): string {
  return `あなたはスキル育成アシスタントです。
ユーザーの入力に基づいて SKILL.md を更新してください。

## 現在の SKILL.md
${existing ?? `---\nname: ${skillName}\ndescription: \n---\n`}

## SKILL.md の形式
- YAML frontmatter（name, description）+ マークダウン本文
- セクション構成は自由。内容に応じて適切に構成する
- 簡潔に、要点のみ記述する

## あなたの役割
- ユーザーの入力を解釈し、SKILL.md への変更を提案する
- 追加・編集・削除を自然言語から判断する
- 既存の内容と重複しないようにする
- ユーザーの意図が曖昧な場合は、確認の質問をする

## 出力形式
JSON形式で出力。説明や前置きは不要。

入力が明確な場合（変更を提案）:
{"type":"proposal","diff":"変更の説明","updated":"変更適用後の SKILL.md 全体（frontmatter 含む）"}

入力が曖昧・不明確な場合（質問して明確にする）:
{"type":"question","message":"質問内容"}`;
}

/** OK/NGボタンの blocks を生成 */
function buildConfirmBlocks(diff: string): unknown[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: diff },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "OK" },
          style: "primary",
          action_id: "train_ok",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "NG" },
          style: "danger",
          action_id: "train_ng",
        },
      ],
    },
  ];
}

export async function handleThreadMessage(
  messenger: Messenger,
  skillStore: SkillStore,
  sessionStore: SessionStore,
  keyVault: KeyVault,
  pendingStore: PendingStore,
  llm: Llm,
  channel: string,
  user: string,
  text: string,
  threadTs: string,
): Promise<void> {
  const skillName = await sessionStore.get(threadTs);
  if (!skillName) return;

  const apiKey = await keyVault.get(user);
  if (!apiKey) {
    await messenger.promptApiKeySetup(channel, user, threadTs);
    return;
  }

  const existing = await skillStore.get(skillName);
  const systemPrompt = buildTrainSystemPrompt(skillName, existing);

  let response: string;
  try {
    response = await llm.chat(
      apiKey,
      [{ role: "user", content: text }],
      systemPrompt,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await messenger.replyInThread(
      channel,
      threadTs,
      `エラーが発生しました: ${message}`,
    );
    return;
  }

  let parsed: { type: string; diff?: string; updated?: string; message?: string };
  try {
    parsed = JSON.parse(response);
  } catch {
    await messenger.replyInThread(
      channel,
      threadTs,
      `応答の解析に失敗しました。もう一度お試しください。`,
    );
    return;
  }

  if (parsed.type === "question" && parsed.message) {
    await messenger.replyInThread(channel, threadTs, parsed.message);
    return;
  }

  if (parsed.type === "proposal" && parsed.diff && parsed.updated) {
    await pendingStore.save(threadTs, parsed.updated);
    await messenger.replyInThread(
      channel,
      threadTs,
      parsed.diff,
      buildConfirmBlocks(parsed.diff),
    );
    return;
  }

  await messenger.replyInThread(
    channel,
    threadTs,
    `応答の解析に失敗しました。もう一度お試しください。`,
  );
}
