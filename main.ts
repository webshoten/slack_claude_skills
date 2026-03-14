import { Hono } from "hono";

type SlackEnv = { Variables: { slackRawBody: string } };
import { SlackMessenger } from "./adapters/slack/messenger.ts";
import { parseSlackEvent } from "./adapters/slack/event.ts";
import { parseSlackInteraction } from "./adapters/slack/interaction.ts";
import { slackVerifyMiddleware } from "./adapters/slack/verify.ts";
import { DenoKvMessageStore } from "./adapters/kv/message-store.ts";
import { DenoKvVault } from "./adapters/kv/vault.ts";
import {
  handleApiKeyButton,
  handleApiKeySave,
  handleMention,
} from "./core/app.ts";
import { createAdmin } from "./adapters/kv/admin.ts";
import { DenoKvBrowser } from "./adapters/kv/browser.ts";

const messenger = new SlackMessenger(Deno.env.get("SLACK_BOT_TOKEN") ?? "");
const store = new DenoKvMessageStore();
const vault = await DenoKvVault.create(Deno.env.get("ENCRYPTION_KEY") ?? "");
const app = new Hono<SlackEnv>();

const browser = new DenoKvBrowser();
app.route("/admin", createAdmin(browser));

app.get("/", (c) => {
  return c.json({ message: "Hello Skill Bot!" });
});

const verify = slackVerifyMiddleware(
  Deno.env.get("SLACK_SIGNING_SECRET") ?? "",
);

// Slack イベント（メンション等）
app.post("/webhook/slack", verify, async (c) => {
  const body = JSON.parse(c.get("slackRawBody"));
  console.log("POST /webhook/slack body:", JSON.stringify(body));

  const event = parseSlackEvent(body);

  if (event.kind === "challenge") {
    return c.json({ challenge: event.challenge });
  }

  // @SkillBot とメンションされたときの処理
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
});

// Slack Interactivity（ボタン押下・Modal送信）
app.post("/webhook/slack/interaction", verify, async (c) => {
  const raw = c.get("slackRawBody");
  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get("payload") ?? "{}");
  console.log("POST /webhook/slack/interaction:", JSON.stringify(payload));

  const interaction = parseSlackInteraction(payload);

  // APIキーを設定するボタンが押されたときの処理
  if (interaction.kind === "apikey_button") {
    await handleApiKeyButton(
      messenger,
      interaction.triggerId,
      interaction.channel,
    );
    return c.json({ ok: true });
  }

  // APIキーが入力されたときの処理
  if (interaction.kind === "apikey_submission") {
    await handleApiKeySave(
      vault,
      messenger,
      interaction.user,
      interaction.channel,
      interaction.apiKey,
    );
    return c.body(null, 200);
  }

  return c.json({ ok: true });
});

Deno.serve(app.fetch);
