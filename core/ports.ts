// Port: メッセージの送信先を抽象化
export interface Messenger {
  reply(channel: string, text: string): Promise<void>;
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
