import type { KvBrowser } from "../../core/ports.ts";

export class DenoKvBrowser implements KvBrowser {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async list(): Promise<{ key: string[]; value: unknown }[]> {
    const kv = await this.getKv();
    const entries: { key: string[]; value: unknown }[] = [];
    for await (const entry of kv.list({ prefix: [] })) {
      entries.push({ key: entry.key as string[], value: entry.value });
    }
    return entries;
  }

  async delete(key: string[]): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(key);
  }
}
