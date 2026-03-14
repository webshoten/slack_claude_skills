// Port: メッセージの送信先を抽象化
export interface Messenger {
  reply(channel: string, text: string): Promise<void>;
}
