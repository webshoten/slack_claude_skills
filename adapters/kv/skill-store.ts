import type { SkillStore } from "../../core/ports.ts";

export class DenoKvSkillStore implements SkillStore {
  private kv: Deno.Kv | null = null;

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async get(name: string): Promise<string | null> {
    const kv = await this.getKv();
    const entry = await kv.get(["skills", name]);
    return (entry.value as string) ?? null;
  }

  async save(name: string, content: string): Promise<void> {
    const kv = await this.getKv();
    await kv.set(["skills", name], content);
  }

  async list(): Promise<string[]> {
    const kv = await this.getKv();
    const names: string[] = [];
    for await (const entry of kv.list({ prefix: ["skills"] })) {
      names.push(entry.key[1] as string);
    }
    return names;
  }

  async delete(name: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["skills", name]);
  }
}
