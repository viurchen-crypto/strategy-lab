import { z } from "zod";
import {
  HermesUnreachableError,
  probe,
  streamChat,
  type ChatMessage,
} from "@/lib/hermes/client";
import { SYSTEM_PROMPT } from "@/lib/hermes/prompt";

export const runtime = "nodejs";
/** Every turn depends on live local state, so nothing here may be prerendered. */
export const dynamic = "force-dynamic";

/** Bounded so a runaway client cannot push an unbounded prompt at the proxy. */
const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(40),
  context: z.string().max(12_000).optional(),
});

const UNREACHABLE = {
  error:
    "Hermes runs on your machine, not on this server. Start the app locally with `npm run dev` " +
    "and make sure the openai-oauth proxy is up.",
  reason: "unreachable" as const,
};

/** A cheap liveness check the panel calls on mount to set its own state. */
export async function GET(): Promise<Response> {
  return Response.json({ available: await probe() });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(parsed.data.context
      ? [{ role: "system" as const, content: parsed.data.context }]
      : []),
    ...parsed.data.messages,
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      try {
        for await (const delta of streamChat(messages, request.signal)) {
          send("delta", { text: delta });
        }
        send("done", {});
      } catch (error) {
        if (request.signal.aborted) {
          // The reader walked away; there is nobody left to tell.
        } else if (error instanceof HermesUnreachableError) {
          send("error", UNREACHABLE);
        } else {
          console.error("hermes bridge failed", error);
          send("error", { error: "Hermes failed to answer", reason: "failed" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
