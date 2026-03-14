// Port: メッセージの送信先を抽象化
export interface Messenger {
  reply(channel: string, text: string): Promise<void>;
}

// Port: メッセージの保存先を抽象化
export interface MessageStore {
  save(channel: string, user: string, text: string, ts: string): Promise<void>;
}
