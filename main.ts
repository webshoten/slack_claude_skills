import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Hello Skill Bot!" });
});

app.post("/webhook/slack", async (c) => {
  const body = await c.req.json();

  // Slack URL verification challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // Event callback (メンション等)
  if (body.type === "event_callback") {
    const event = body.event;
    console.log("Received event:", event.type, event.text);
    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

Deno.serve(app.fetch);
