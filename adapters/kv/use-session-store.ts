import type { UseSession, UseSessionStore } from "../../core/ports.ts";

export class DenoKvUseSessionStore implements UseSessionStore {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async start(threadTs: string, session: UseSession): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["use_sessions", threadTs], session);
  }

  async get(threadTs: string): Promise<UseSession | null> {
    const kv = await this.getKv();
    const entry = await kv.get(["use_sessions", threadTs]);
    return (entry.value as UseSession) ?? null;
  }

  async end(threadTs: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["use_sessions", threadTs]);
  }
}
