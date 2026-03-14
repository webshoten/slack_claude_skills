import type { Messenger } from "../../core/ports.ts";

export class SlackMessenger implements Messenger {
  constructor(private token: string) {}

  async reply(channel: string, text: string): Promise<void> {
    await this.slackApi("chat.postMessage", { channel, text });
  }

  async replyEphemeral(
    channel: string,
    user: string,
    text: string,
  ): Promise<void> {
    await this.slackApi("chat.postEphemeral", { channel, user, text });
  }

  // APIキーを設定するボタンを表示
  async promptApiKeySetup(channel: string, user: string): Promise<void> {
    await this.slackApi("chat.postEphemeral", {
      channel,
      user,
      text: "Claude APIキーを設定してください",
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
    });
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
}
