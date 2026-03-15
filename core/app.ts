import type {
  KeyVault,
  Llm,
  MessageStore,
  Messenger,
  SessionStore,
  SkillStore,
} from "./ports.ts";
import * as apikey from "./apikey.ts";
import * as train from "./train.ts";

export type Ports = {
  messenger: Messenger;
  messageStore: MessageStore;
  keyVault: KeyVault;
  skillStore: SkillStore;
  sessionStore: SessionStore;
  llm: Llm;
};

/** メンションのテキストからBot名部分を除去してコマンドを取り出す */
function parseCommand(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

export function createApp(ports: Ports) {
  const { messenger, messageStore, keyVault, skillStore, sessionStore, llm } =
    ports;

  return {
    async handleMention(
      channel: string,
      user: string,
      text: string,
      ts: string,
      threadTs?: string,
    ): Promise<void> {
      await messageStore.save(channel, user, text, ts);

      const command = parseCommand(text);

      if (command === "set-key") {
        await messenger.promptApiKeySetup(channel, user, ts);
        return;
      }

      // set-key 以外はすべて APIキー必須
      const apiKey = await keyVault.get(user);

      // コマンドなし → ヘルプ表示
      if (command === "") {
        const keyStatus = apiKey
          ? `設定済み（...${apiKey.slice(-4)}）`
          : "未設定";
        const help = [
          `APIキー: ${keyStatus}`,
          "",
          "コマンド:",
          "• set-key — Claude APIキー登録",
          "• train スキル名 — スキル育成",
          "• use スキル名 — スキル実行",
          "• list — スキル一覧",
        ].join("\n");
        await messenger.reply(channel, help, ts);
        return;
      }

      // APIキー未登録なら設定を促す
      if (!apiKey) {
        await messenger.promptApiKeySetup(channel, user, ts);
        return;
      }

      // train コマンド
      if (command === "train" || command.startsWith("train ")) {
        const skillName = command.slice("train".length).trim();
        if (!skillName) {
          if (threadTs) {
            await train.handleTrainStatus(
              messenger, sessionStore,
              channel, threadTs,
            );
          } else {
            await messenger.reply(
              channel,
              "スキル名を指定してください。例: `train react-expert`",
              ts,
            );
          }
          return;
        }
        // スレッド内からのメンションかどうか
        if (threadTs) {
          await train.handleTrainInThread(
            messenger,
            skillStore,
            sessionStore,
            channel,
            skillName,
            threadTs,
          );
        } else {
          await train.handleTrainStart(
            messenger,
            skillStore,
            sessionStore,
            channel,
            skillName,
            ts,
          );
        }
        return;
      }

      // TODO: use, list の実装
      await messenger.reply(channel, `受け取りました: ${text}`);
    },

    async handleApiKeyButton(
      triggerId: string,
      channel: string,
    ): Promise<void> {
      await apikey.handleApiKeyButton(messenger, triggerId, channel);
    },

    async handleApiKeySave(
      userId: string,
      channel: string,
      key: string,
    ): Promise<void> {
      await apikey.handleApiKeySave(
        messenger,
        keyVault,
        llm,
        userId,
        channel,
        key,
      );
    },
  };
}
