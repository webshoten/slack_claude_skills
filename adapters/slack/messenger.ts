import type { Messenger, ThreadMessage } from "../../core/ports.ts";

export class SlackMessenger implements Messenger {
  constructor(private token: string) {}

  async reply(channel: string, text: string, threadTs?: string): Promise<void> {
    const payload: Record<string, unknown> = { channel, text };
    if (threadTs) payload.thread_ts = threadTs;
    await this.slackApi("chat.postMessage", payload);
  }

  async replyEphemeral(
    channel: string,
    user: string,
    text: string,
  ): Promise<void> {
    await this.slackApi("chat.postEphemeral", { channel, user, text });
  }

  // APIキーを設定するボタンを表示
  async promptApiKeySetup(channel: string, user: string, threadTs?: string): Promise<void> {
    const payload: Record<string, unknown> = {
      channel,
      user,
      text: "Claude APIキーを設定してください（Anthropic の API キーが必要です）",
      blocks: [
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "APIキーを設定" },
              action_id: "open_apikey_modal",
            },
          ],
        },
      ],
    };
    if (threadTs) payload.thread_ts = threadTs;
    await this.slackApi("chat.postEphemeral", payload);
  }

  // APIキーを設定するフォームを開く
  async openApiKeyForm(triggerId: string, channel: string): Promise<void> {
    await this.slackApi("views.open", {
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "apikey_modal",
        private_metadata: channel,
        title: { type: "plain_text", text: "APIキー設定" },
        submit: { type: "plain_text", text: "保存" },
        blocks: [
          {
            type: "input",
            block_id: "apikey_block",
            element: {
              type: "plain_text_input",
              action_id: "apikey_input",
              placeholder: { type: "plain_text", text: "sk-ant-api03-..." },
            },
            label: { type: "plain_text", text: "Claude APIキー" },
          },
        ],
      },
    });
  }

  async replyInThread(
    channel: string,
    threadTs: string,
    text: string,
    blocks?: unknown[],
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      channel,
      thread_ts: threadTs,
      text,
    };
    if (blocks) payload.blocks = blocks;
    await this.slackApi("chat.postMessage", payload);
  }

  async updateMessage(channel: string, ts: string, text: string): Promise<void> {
    await this.slackApi("chat.update", { channel, ts, text, blocks: [] });
  }

  async getThreadReplies(channel: string, threadTs: string): Promise<ThreadMessage[]> {
    const data = await this.slackApiJson("conversations.replies", {
      channel,
      ts: threadTs,
    });
    // deno-lint-ignore no-explicit-any
    return (data.messages ?? []).map((m: any) => ({
      text: m.text ?? "",
      ts: m.ts,
      botId: m.bot_id ?? undefined,
    }));
  }

  private async slackApi(
    method: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
  }

  // deno-lint-ignore no-explicit-any
  private async slackApiJson(method: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  }
}
