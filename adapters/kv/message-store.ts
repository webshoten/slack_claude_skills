import type { MessageStore } from "../../core/ports.ts";

export class DenoKvMessageStore implements MessageStore {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async save(channel: string, user: string, text: string, ts: string): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["messages", channel, ts], { user, text, ts });
    console.log("KV saved:", ["messages", channel, ts], { user, text, ts });
  }
}
