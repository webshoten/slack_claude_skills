import type {
  KeyVault,
  Llm,
  MessageStore,
  Messenger,
  PendingStore,
  SessionStore,
  SkillStore,
  UseSessionStore,
} from "./ports.ts";
import * as apikey from "./apikey.ts";
import * as train from "./train.ts";
import * as use from "./use.ts";

export type Ports = {
  messenger: Messenger;
  messageStore: MessageStore;
  keyVault: KeyVault;
  skillStore: SkillStore;
  sessionStore: SessionStore;
  useSessionStore: UseSessionStore;
  pendingStore: PendingStore;
  llm: Llm;
};

/** メンションのテキストからBot名部分を除去してコマンドを取り出す */
function parseCommand(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").replace(/\u3000/g, " ").trim();
}

export function createApp(ports: Ports) {
  const {
    messenger, messageStore, keyVault, skillStore, sessionStore, useSessionStore,
    pendingStore, llm,
  } = ports;

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
        // スレッド内で train → use セッションを削除
        if (threadTs) {
          await useSessionStore.end(threadTs);
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

      // show コマンド
      if (command === "show" || command.startsWith("show ")) {
        const skillName = command.slice("show".length).trim();
        if (skillName) {
          // チャンネルまたはスレッドでスキル名を指定
          await train.handleShowSkill(messenger, skillStore, channel, skillName, threadTs ?? ts);
        } else if (threadTs) {
          // スレッド内でスキル名省略 → セッションのスキルを表示
          await train.handleShowSkill(messenger, skillStore, channel, null, threadTs, sessionStore);
        } else {
          await messenger.reply(channel, "スキル名を指定してください。例: `show react-expert`", ts);
        }
        return;
      }

      // use コマンド
      if (command === "use" || command.startsWith("use ")) {
        const skillName = command.slice("use".length).trim();
        if (!skillName) {
          await messenger.reply(
            channel,
            "スキル名を指定してください。例: `use react-expert`",
            threadTs ?? ts,
          );
          return;
        }
        await use.handleUseStart(
          messenger, skillStore, useSessionStore,
          channel, skillName, threadTs ?? ts,
        );
        return;
      }

      // list コマンド
      if (command === "list") {
        const skills = await skillStore.list();
        const msg = skills.length > 0
          ? `スキル一覧:\n${skills.map((s) => `• ${s}`).join("\n")}`
          : "スキルはまだありません。`train スキル名` で作成してください。";
        await messenger.reply(channel, msg, threadTs ?? ts);
        return;
      }

      await messenger.reply(channel, `受け取りました: ${text}`);
    },

    async handleThreadMessage(
      channel: string,
      user: string,
      text: string,
      threadTs: string,
    ): Promise<void> {
      // use セッションを優先チェック
      const useSession = await useSessionStore.get(threadTs);
      if (useSession) {
        await use.handleUseMessage(
          messenger, skillStore, useSessionStore, keyVault, llm,
          channel, user, text, threadTs,
        );
        return;
      }

      // train セッション
      await train.handleThreadMessage(
        messenger, skillStore, sessionStore, keyVault, pendingStore, llm,
        channel, user, text, threadTs,
      );
    },

    async handleTrainConfirm(
      channel: string,
      threadTs: string,
      messageTs: string,
      approved: boolean,
    ): Promise<void> {
      await train.handleTrainConfirm(
        messenger, skillStore, sessionStore, pendingStore,
        channel, threadTs, messageTs, approved,
      );
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
