import { Hono } from "hono";

type SlackEnv = { Variables: { slackBody: Record<string, unknown> } };
import { SlackMessenger } from "./adapters/slack/messenger.ts";
import { parseSlackEvent } from "./adapters/slack/event.ts";
import { slackVerifyMiddleware } from "./adapters/slack/verify.ts";
import { DenoKvMessageStore } from "./adapters/kv/message-store.ts";
import { handleMention } from "./core/app.ts";

const messenger = new SlackMessenger(Deno.env.get("SLACK_BOT_TOKEN") ?? "");
const store = new DenoKvMessageStore();
const app = new Hono<SlackEnv>();

app.get("/", (c) => {
  return c.json({ message: "Hello Skill Bot!" });
});

app.post(
  "/webhook/slack",
  slackVerifyMiddleware(Deno.env.get("SLACK_SIGNING_SECRET") ?? ""),
  async (c) => {
    const body = c.get("slackBody");
    console.log("POST /webhook/slack body:", JSON.stringify(body));

    const event = parseSlackEvent(body);

    if (event.kind === "challenge") {
      return c.json({ challenge: event.challenge });
    }
    if (event.kind === "mention") {
      await handleMention(
        messenger,
        store,
        event.channel,
        event.user,
        event.text,
        event.ts,
      );
    }

    return c.json({ ok: true });
  },
);

Deno.serve(app.fetch);
