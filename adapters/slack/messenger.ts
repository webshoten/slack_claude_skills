import type { Messenger } from "../../core/ports.ts";

export class SlackMessenger implements Messenger {
  constructor(private token: string) {}

  async reply(channel: string, text: string): Promise<void> {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
  }
}
