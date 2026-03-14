import type { KeyVault } from "../../core/ports.ts";

export class DenoKvVault implements KeyVault {
  private kv: Deno.Kv | null = null;
  private masterKey: CryptoKey;

  private constructor(masterKey: CryptoKey) {
    this.masterKey = masterKey;
  }

  /** 環境変数の base64 マスターキーから生成 */
  static async create(base64Key: string): Promise<DenoKvVault> {
    const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
    const masterKey = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    return new DenoKvVault(masterKey);
  }

  private async getKv(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
    return this.kv;
  }

  async get(userId: string): Promise<string | null> {
    const kv = await this.getKv();
    const entry = await kv.get(["api_keys", userId]);
    if (!entry.value) return null;
    return await this.decrypt(entry.value as string);
  }

  async save(userId: string, key: string): Promise<void> {
    const kv = await this.getKv();
    const encrypted = await this.encrypt(key);
    await kv.set(["api_keys", userId], encrypted);
  }

  async delete(userId: string): Promise<void> {
    const kv = await this.getKv();
    await kv.delete(["api_keys", userId]);
  }

  private async encrypt(plainText: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.masterKey,
      encoded,
    );
    // IV(12byte) + 暗号文を結合して base64 に
    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  private async decrypt(stored: string): Promise<string> {
    const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const cipherText = bytes.slice(12);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      this.masterKey,
      cipherText,
    );
    return new TextDecoder().decode(plainBuffer);
  }
}
