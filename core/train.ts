import type {
  KeyVault,
  Llm,
  Messenger,
  PendingStore,
  SessionStore,
  SkillStore,
} from "./ports.ts";

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
- ユーザーの意図が曖昧な場合は、最も自然な解釈で提案する

## 出力形式
以下の2つをJSON形式で返してください:
1. "diff": 変更の説明（ユーザーに見せる差分表示）
2. "updated": 変更適用後の SKILL.md 全体（frontmatter 含む）

説明や前置きは不要。JSONのみ出力。`;
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

  let parsed: { diff: string; updated: string };
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

  await pendingStore.save(threadTs, parsed.updated);
  await messenger.replyInThread(
    channel,
    threadTs,
    parsed.diff,
    buildConfirmBlocks(parsed.diff),
  );
}
