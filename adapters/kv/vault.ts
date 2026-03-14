import type { KeyVault } from "../../core/ports.ts";

export class DenoKvVault implements KeyVault {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async get(userId: string): Promise<string | null> {
    const kv = await this.getKv();
    const entry = await kv.get(["api_keys", userId]);
    return entry.value as string | null;
  }

  async save(userId: string, key: string): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["api_keys", userId], key);
  }

  async delete(userId: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["api_keys", userId]);
  }
}
