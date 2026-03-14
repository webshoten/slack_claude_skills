// Port: メッセージの送信先を抽象化
export interface Messenger {
  reply(channel: string, text: string): Promise<void>;
  // 本人だけに見えるメッセージ
  replyEphemeral(channel: string, user: string, text: string): Promise<void>;
  // APIキー入力を促すUI表示
  promptApiKeySetup(channel: string, user: string): Promise<void>;
  // APIキー入力フォームを開く
  openApiKeyForm(triggerId: string, channel: string): Promise<void>;
}

// Port: メッセージの保存先を抽象化
export interface MessageStore {
  save(channel: string, user: string, text: string, ts: string): Promise<void>;
}

// Port: KVの横断的な閲覧・削除（管理用）
export interface KvBrowser {
  list(): Promise<{ key: string[]; value: unknown }[]>;
  delete(key: string[]): Promise<void>;
}

// Port: LLM（バリデーション・チャット）
export interface Llm {
  validate(apiKey: string): Promise<boolean>;
}

// Port: APIキーの保管（暗号化は adapter の責務）
export interface KeyVault {
  get(userId: string): Promise<string | null>;
  save(userId: string, key: string): Promise<void>;
  delete(userId: string): Promise<void>;
}
