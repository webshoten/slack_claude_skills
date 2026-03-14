import { Hono } from "hono";

const admin = new Hono();

// Basic認証
admin.use("*", async (c, next) => {
  const password = Deno.env.get("ADMIN_PASSWORD");
  if (!password) {
    return c.text("ADMIN_PASSWORD not configured", 500);
  }

  // Basic認証
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Basic ")) {
    c.header("WWW-Authenticate", 'Basic realm="admin"');
    return c.text("Unauthorized", 401);
  }

  // Basic認証のユーザー名とパスワードを取得
  const decoded = atob(auth.slice(6));
  const [user, pass] = decoded.split(":");
  if (user !== "admin" || pass !== password) {
    c.header("WWW-Authenticate", 'Basic realm="admin"');
    return c.text("Unauthorized", 401);
  }

  await next();
});

// 削除
admin.post("/kv/delete", async (c) => {
  const body = await c.req.parseBody();
  const rawKey = body["key"] as string;
  if (!rawKey) return c.text("key required", 400);

  const key = JSON.parse(rawKey) as string[];
  const kv = await Deno.openKv();
  await kv.delete(key);
  kv.close();

  return c.redirect("/admin/kv");
});

// 一覧表示
admin.get("/kv", async (c) => {
  const kv = await Deno.openKv();
  const entries: { key: string[]; value: unknown }[] = [];

  for await (const entry of kv.list({ prefix: [] })) {
    entries.push({
      key: entry.key as string[],
      value: entry.value,
    });
  }
  kv.close();

  const rows = entries
    .map((e) => {
      const keyJson = JSON.stringify(e.key);
      const displayValue = maskSensitive(e.key, e.value);
      return `<tr>
        <td><code>${escapeHtml(keyJson)}</code></td>
        <td><pre>${escapeHtml(JSON.stringify(displayValue, null, 2))}</pre></td>
        <td>
          <form method="POST" action="/admin/kv/delete" onsubmit="return confirm('削除しますか？')">
            <input type="hidden" name="key" value="${escapeAttr(keyJson)}">
            <button type="submit">削除</button>
          </form>
        </td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>KV Viewer</title>
  <style>
    body { font-family: monospace; margin: 2rem; background: #f5f5f5; }
    table { border-collapse: collapse; width: 100%; background: #fff; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #333; color: #fff; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
    button { background: #e74c3c; color: #fff; border: none; padding: 4px 12px; cursor: pointer; border-radius: 3px; }
    button:hover { background: #c0392b; }
    .count { color: #666; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>Deno KV Viewer</h1>
  <p class="count">${entries.length} entries</p>
  <table>
    <tr><th>Key</th><th>Value</th><th></th></tr>
    ${rows || '<tr><td colspan="3">No entries</td></tr>'}
  </table>
</body>
</html>`;

  return c.html(html);
});

/** APIキーなど機密値をマスクする */
function maskSensitive(key: string[], value: unknown): unknown {
  if (key[0] === "api_keys" && typeof value === "string") {
    return value.length > 4 ? "..." + value.slice(-4) : "****";
  }
  return value;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export { admin };
