/**
 * Talks to Hermes through the local OpenAI-compatible proxy it already uses for
 * its own inference (`~/.hermes/config.yaml` → `custom:openai-oauth`).
 *
 * That proxy listens on loopback on the machine running this app, so the bridge
 * is a local-only feature by construction: a deployed build has no Hermes to
 * reach, and says so rather than hanging.
 */
export const HERMES_BASE_URL = process.env.HERMES_BASE_URL ?? "http://127.0.0.1:10531/v1";
export const HERMES_MODEL = process.env.HERMES_MODEL ?? "gpt-5.6-terra";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class HermesUnreachableError extends Error {
  constructor(readonly cause_: unknown) {
    super("Hermes is not reachable from this server");
    this.name = "HermesUnreachableError";
  }
}

/** A short probe so the UI can show the bridge's state before anyone types. */
export async function probe(): Promise<boolean> {
  try {
    const response = await fetch(`${HERMES_BASE_URL}/models`, {
      signal: AbortSignal.timeout(2_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Streams a completion, yielding content deltas. The proxy speaks
 * `chat_completions` with SSE, the same shape OpenAI does.
 */
export async function* streamChat(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let response: Response;
  try {
    response = await fetch(`${HERMES_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: HERMES_MODEL, messages, stream: true }),
      signal,
    });
  } catch (cause) {
    throw new HermesUnreachableError(cause);
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hermes returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) yield delta;
        } catch {
          // A frame that is not JSON is not fatal; the stream continues.
        }
      }
    }
  }
}
