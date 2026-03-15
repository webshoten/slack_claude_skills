import type { Llm, LlmMessage, LlmTool } from "../../core/ports.ts";

export class ClaudeLlm implements Llm {
  async validate(apiKey: string): Promise<boolean> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    return res.ok;
  }

  async chat(
    apiKey: string,
    messages: LlmMessage[],
    systemPrompt: string,
    model?: string,
    tools?: LlmTool[],
  ): Promise<string> {
    // messages を Claude API 形式に変換（tool_result 等も含むためそのまま渡す）
    // deno-lint-ignore no-explicit-any
    const apiMessages: any[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // tool use のループ（最大10回まで）
    for (let i = 0; i < 10; i++) {
      // deno-lint-ignore no-explicit-any
      const body: any = {
        model: model ?? "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
      };
      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Claude API error: ${res.status} ${error}`);
      }

      const data = await res.json();
      console.log(`Tool loop ${i + 1}: stop_reason=${data.stop_reason}, content types=${data.content.map((b: any) => b.type).join(",")}`);

      // tool_use がなければテキストを返して終了
      // deno-lint-ignore no-explicit-any
      const toolUseBlocks = data.content.filter((b: any) => b.type === "tool_use");
      if (toolUseBlocks.length === 0) {
        // deno-lint-ignore no-explicit-any
        const textBlock = data.content.find((b: any) => b.type === "text");
        return textBlock?.text ?? "";
      }

      // すべての tool_use を処理
      // deno-lint-ignore no-explicit-any
      const toolResults: any[] = [];
      for (const toolUseBlock of toolUseBlocks) {
        const toolResult = await this.executeTool(toolUseBlock.name, toolUseBlock.input);
        console.log(`Tool call: ${toolUseBlock.name}(${JSON.stringify(toolUseBlock.input).slice(0, 200)}) → ${toolResult.slice(0, 200)}`);
        toolResults.push({ type: "tool_result", tool_use_id: toolUseBlock.id, content: toolResult });
      }

      // assistant の応答と tool_result を会話に追加して再ループ
      apiMessages.push({ role: "assistant", content: data.content });
      apiMessages.push({ role: "user", content: toolResults });
    }

    throw new Error("ツール呼び出しの上限に達しました");
  }

  // deno-lint-ignore no-explicit-any
  private async executeTool(name: string, input: any): Promise<string> {
    if (name === "web_fetch") {
      return await this.webFetch(input.url);
    }
    return `不明なツール: ${name}`;
  }

  private async webFetch(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SkillBot/1.0" },
      });
      if (!res.ok) {
        return `HTTP ${res.status}: ${url} の取得に失敗しました`;
      }
      const html = await res.text();

      // Google 検索が bot ブロックされた場合、DuckDuckGo にフォールバック
      if (url.includes("google.com/search") && html.includes("Please click here if you are not redirected")) {
        const googleUrl = new URL(url);
        const query = googleUrl.searchParams.get("q") ?? "";
        if (query) {
          console.log(`Google blocked, falling back to DuckDuckGo: ${query}`);
          return await this.webFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
        }
      }

      // HTMLタグを除去してテキストだけ返す（トークン節約）
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // 長すぎる場合は切り詰め（レートリミット対策）
      return text.length > 5000 ? text.slice(0, 5000) + "...（省略）" : text;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return `取得エラー: ${message}`;
    }
  }
}
