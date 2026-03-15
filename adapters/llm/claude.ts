import type { Llm, LlmMessage } from "../../core/ports.ts";

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
  ): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model ?? "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Claude API error: ${res.status} ${error}`);
    }

    const data = await res.json();
    return data.content[0].text;
  }
}
