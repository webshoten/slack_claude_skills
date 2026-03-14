import { Hono } from "hono";
import { SlackMessenger } from "./adapters/slack/messenger.ts";
import { parseSlackEvent } from "./adapters/slack/event.ts";
import { handleMention } from "./core/app.ts";

const messenger = new SlackMessenger(Deno.env.get("SLACK_BOT_TOKEN") ?? "");
const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Hello Skill Bot!" });
});

app.post("/webhook/slack", async (c) => {
  const body = await c.req.json();
  console.log("POST /webhook/slack body:", JSON.stringify(body));

  const event = parseSlackEvent(body);

  if (event.kind === "challenge") {
    return c.json({ challenge: event.challenge });
  }
  if (event.kind === "mention") {
    await handleMention(messenger, event.channel, event.text);
  }

  return c.json({ ok: true });
});

Deno.serve(app.fetch);
