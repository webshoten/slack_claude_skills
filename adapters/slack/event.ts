export type SlackEvent =
  | { kind: "challenge"; challenge: string }
  | { kind: "mention"; channel: string; text: string; user: string; ts: string; threadTs?: string }
  | { kind: "unknown" };

export function parseSlackEvent(body: Record<string, unknown>): SlackEvent {
  if (body.type === "url_verification") {
    return { kind: "challenge", challenge: body.challenge as string };
  }
  if (body.type === "event_callback") {
    const event = body.event as Record<string, string>;
    if (event.type === "app_mention") {
      return { kind: "mention", channel: event.channel, text: event.text, user: event.user, ts: event.ts, threadTs: event.thread_ts || undefined };
    }
  }
  return { kind: "unknown" };
}
