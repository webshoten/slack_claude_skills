import type { SessionStore } from "../../core/ports.ts";

export class DenoKvSessionStore implements SessionStore {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async start(threadTs: string, skillName: string): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["train_sessions", threadTs], skillName);
  }

  async get(threadTs: string): Promise<string | null> {
    const kv = await this.getKv();
    const entry = await kv.get(["train_sessions", threadTs]);
    return (entry.value as string) ?? null;
  }

  async end(threadTs: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["train_sessions", threadTs]);
  }
}
