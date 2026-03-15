export type SlackInteraction =
  | { kind: "apikey_button"; triggerId: string; user: string; channel: string }
  | { kind: "apikey_submission"; user: string; channel: string; apiKey: string }
  | { kind: "train_confirm"; approved: boolean; user: string; channel: string; threadTs: string }
  | { kind: "unknown" };

// deno-lint-ignore no-explicit-any
export function parseSlackInteraction(payload: any): SlackInteraction {
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (action?.action_id === "open_apikey_modal") {
      return {
        kind: "apikey_button",
        triggerId: payload.trigger_id,
        user: payload.user.id,
        channel: payload.channel?.id ?? "",
      };
    }
    if (action?.action_id === "train_ok" || action?.action_id === "train_ng") {
      return {
        kind: "train_confirm",
        approved: action.action_id === "train_ok",
        user: payload.user.id,
        channel: payload.channel?.id ?? "",
        threadTs: payload.message?.thread_ts ?? "",
      };
    }
  }

  if (payload.type === "view_submission") {
    if (payload.view.callback_id === "apikey_modal") {
      return {
        kind: "apikey_submission",
        user: payload.user.id,
        channel: payload.view.private_metadata ?? "",
        apiKey: payload.view.state.values.apikey_block.apikey_input.value,
      };
    }
  }

  return { kind: "unknown" };
}
