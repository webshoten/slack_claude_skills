import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Hello Skill Bot!" });
});

Deno.serve(app.fetch);
