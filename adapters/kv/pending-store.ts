import type { PendingStore } from "../../core/ports.ts";

export class DenoKvPendingStore implements PendingStore {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async save(threadTs: string, content: string): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["pending", threadTs], content);
  }

  async get(threadTs: string): Promise<string | null> {
    const kv = await this.getKv();
    const entry = await kv.get(["pending", threadTs]);
    return (entry.value as string) ?? null;
  }

  async delete(threadTs: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["pending", threadTs]);
  }
}
