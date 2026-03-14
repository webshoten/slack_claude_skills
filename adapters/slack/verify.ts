import type { Context, Next } from "hono";

const FIVE_MINUTES = 5 * 60;

/**
 * Slack リクエスト署名検証ミドルウェア
 *
 * /webhook/slack は公開エンドポイントなので、誰でも POST できてしまう。
 * Slack は全リクエストに Signing Secret で署名を付けるため、
 * これを検証することで第三者からの偽リクエストを拒否できる。
 *
 * 参考: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function slackVerifyMiddleware(signingSecret: string) {
  return async (c: Context, next: Next) => {
    const timestamp = c.req.header("x-slack-request-timestamp");
    const signature = c.req.header("x-slack-signature");

    if (!timestamp || !signature) {
      console.log("Slack verify: missing headers");
      return c.json({ error: "missing headers" }, 401);
    }

    // 古いリクエストを拒否する。攻撃者が過去のリクエストをコピーして
    // 再送する「リプレイ攻撃」を防ぐため。
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > FIVE_MINUTES) {
      console.log("Slack verify: request too old");
      return c.json({ error: "request too old" }, 401);
    }

    // Slack の署名仕様に従い "v0:{timestamp}:{body}" を Signing Secret で
    // HMAC-SHA256 ハッシュ化する。Signing Secret を知らない第三者には
    // 正しい署名を生成できないため、なりすましを防止できる。
    const body = await c.req.text();
    const baseString = `v0:${timestamp}:${body}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
    const computed = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

    if (computed !== signature) {
      console.log("Slack verify: invalid signature");
      return c.json({ error: "invalid signature" }, 401);
    }

    // c.req.text() で body を消費済みのため、パース結果を c.set() で
    // 後続ハンドラに渡す。こうしないと body を再度読み取れない。
    c.set("slackBody", JSON.parse(body));
    await next();
  };
}
