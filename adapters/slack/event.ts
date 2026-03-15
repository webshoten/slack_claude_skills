export type SlackEvent =
  | { kind: "challenge"; challenge: string }
  | {
    kind: "mention";
    channel: string;
    text: string;
    user: string;
    ts: string;
    threadTs?: string;
  }
  | {
    kind: "thread_message";
    channel: string;
    user: string;
    text: string;
    ts: string;
    threadTs: string;
  }
  | { kind: "unknown" };

export function parseSlackEvent(
  body: Record<string, unknown>,
): SlackEvent {
  if (body.type === "url_verification") {
    return { kind: "challenge", challenge: body.challenge as string };
  }
  if (body.type === "event_callback") {
    const event = body.event as Record<string, string>;

    if (event.type === "app_mention") {
      return {
        kind: "mention",
        channel: event.channel,
        text: event.text,
        user: event.user,
        ts: event.ts,
        threadTs: event.thread_ts || undefined,
      };
    }

    // スレッド内のメッセージ（メンションなし）
    // bot_id があれば Bot 自身の投稿なので無視（無限ループ防止）
    // メンションを含むメッセージは app_mention で処理済みなので除外
    // （除外しないと show 等のコマンドが育成入力としても二重処理される）
    if (
      event.type === "message" &&
      !event.subtype &&
      event.thread_ts &&
      !event.bot_id &&
      !/<@[A-Z0-9]+>/.test(event.text)
    ) {
      return {
        kind: "thread_message",
        channel: event.channel,
        user: event.user,
        text: event.text,
        ts: event.ts,
        threadTs: event.thread_ts,
      };
    }
  }
  return { kind: "unknown" };
}
