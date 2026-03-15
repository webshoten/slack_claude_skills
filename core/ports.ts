// Port: メッセージの送信先を抽象化
export interface Messenger {
  reply(channel: string, text: string, threadTs?: string): Promise<void>;
  // 本人だけに見えるメッセージ
  replyEphemeral(channel: string, user: string, text: string): Promise<void>;
  // APIキー入力を促すUI表示
  promptApiKeySetup(channel: string, user: string, threadTs?: string): Promise<void>;
  // APIキー入力フォームを開く
  openApiKeyForm(triggerId: string, channel: string): Promise<void>;
  // スレッド内にブロック付き返信
  replyInThread(
    channel: string,
    threadTs: string,
    text: string,
    blocks?: unknown[],
  ): Promise<void>;
  // 既存メッセージを更新（ボタン差し替え等）
  updateMessage(channel: string, ts: string, text: string): Promise<void>;
  // スレッドの返信一覧を取得
  getThreadReplies(channel: string, threadTs: string): Promise<ThreadMessage[]>;
}

// スレッド内のメッセージ
export type ThreadMessage = {
  text: string;
  ts: string;
  botId?: string;
};

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
export type LlmMessage = { role: "user" | "assistant"; content: string };

export interface Llm {
  validate(apiKey: string): Promise<boolean>;
  chat(
    apiKey: string,
    messages: LlmMessage[],
    systemPrompt: string,
    model?: string,
  ): Promise<string>;
}

// Port: APIキーの保管（暗号化は adapter の責務）
export interface KeyVault {
  get(userId: string): Promise<string | null>;
  save(userId: string, key: string): Promise<void>;
  delete(userId: string): Promise<void>;
}

// Port: スキル（SKILL.md）の保存
export interface SkillStore {
  get(name: string): Promise<string | null>;
  save(name: string, content: string): Promise<void>;
  list(): Promise<string[]>;
  delete(name: string): Promise<void>;
}

// Port: 育成（train）セッションの管理
export interface SessionStore {
  start(threadTs: string, skillName: string): Promise<void>;
  get(threadTs: string): Promise<string | null>;
  end(threadTs: string): Promise<void>;
}

// Port: 実行（use）セッションの管理
export type UseSession = { skillName: string; startTs: string };

export interface UseSessionStore {
  start(threadTs: string, session: UseSession): Promise<void>;
  get(threadTs: string): Promise<UseSession | null>;
  end(threadTs: string): Promise<void>;
}

// Port: OK待ちの一時データ保存
export interface PendingStore {
  save(threadTs: string, content: string): Promise<void>;
  get(threadTs: string): Promise<string | null>;
  delete(threadTs: string): Promise<void>;
}
