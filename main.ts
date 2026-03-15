import { Hono } from "hono";

type SlackEnv = { Variables: { slackRawBody: string } };
import { SlackMessenger } from "./adapters/slack/messenger.ts";
import { parseSlackEvent } from "./adapters/slack/event.ts";
import { parseSlackInteraction } from "./adapters/slack/interaction.ts";
import { slackVerifyMiddleware } from "./adapters/slack/verify.ts";
import { DenoKvMessageStore } from "./adapters/kv/message-store.ts";
import { DenoKvVault } from "./adapters/kv/vault.ts";
import { DenoKvSkillStore } from "./adapters/kv/skill-store.ts";
import { DenoKvSessionStore } from "./adapters/kv/session-store.ts";
import { DenoKvPendingStore } from "./adapters/kv/pending-store.ts";
import { createAdmin } from "./adapters/kv/admin.ts";
import { DenoKvBrowser } from "./adapters/kv/browser.ts";
import { ClaudeLlm } from "./adapters/llm/claude.ts";
import { createApp } from "./core/app.ts";

const skillBot = createApp({
  messenger: new SlackMessenger(Deno.env.get("SLACK_BOT_TOKEN") ?? ""),
  messageStore: new DenoKvMessageStore(),
  keyVault: await DenoKvVault.create(Deno.env.get("ENCRYPTION_KEY") ?? ""),
  skillStore: new DenoKvSkillStore(),
  sessionStore: new DenoKvSessionStore(),
  pendingStore: new DenoKvPendingStore(),
  llm: new ClaudeLlm(),
});

const server = new Hono<SlackEnv>();

const browser = new DenoKvBrowser();
server.route("/admin", createAdmin(browser));

server.get("/", (c) => {
  return c.json({ message: "Hello Skill Bot!" });
});

const verify = slackVerifyMiddleware(
  Deno.env.get("SLACK_SIGNING_SECRET") ?? "",
);

// Slack イベント（メンション等）
server.post("/webhook/slack", verify, async (c) => {
  const body = JSON.parse(c.get("slackRawBody"));
  console.log("POST /webhook/slack body:", JSON.stringify(body));

  const event = parseSlackEvent(body);

  if (event.kind === "challenge") {
    return c.json({ challenge: event.challenge });
  }

  // スレッド内の@SkillBotメンションかどうか
  if (event.kind === "mention") {
    await skillBot.handleMention(
      event.channel,
      event.user,
      event.text,
      event.ts,
      event.threadTs,
    );
  }

  // スレッド内のメッセージかどうか
  if (event.kind === "thread_message") {
    await skillBot.handleThreadMessage(
      event.channel,
      event.user,
      event.text,
      event.threadTs,
    );
  }

  return c.json({ ok: true });
});

// Slack Interactivity（ボタン押下・Modal送信）
server.post("/webhook/slack/interaction", verify, async (c) => {
  const raw = c.get("slackRawBody");
  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get("payload") ?? "{}");
  console.log("POST /webhook/slack/interaction:", JSON.stringify(payload));

  const interaction = parseSlackInteraction(payload);

  if (interaction.kind === "apikey_button") {
    await skillBot.handleApiKeyButton(
      interaction.triggerId,
      interaction.channel,
    );
    return c.json({ ok: true });
  }

  if (interaction.kind === "apikey_submission") {
    await skillBot.handleApiKeySave(
      interaction.user,
      interaction.channel,
      interaction.apiKey,
    );
    return c.body(null, 200);
  }

  return c.json({ ok: true });
});

Deno.serve(server.fetch);
