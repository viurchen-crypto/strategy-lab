"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseActions, stripPendingFence, type LabAction } from "@/lib/hermes/actions";

export interface ChatTurn {
  readonly id: number;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly actions?: LabAction[];
  /** Set when the turn is an error notice rather than an answer. */
  readonly failed?: boolean;
}

export type BridgeState = "checking" | "ready" | "offline";

/** Sent to the model as history; the system prompt and context live server-side. */
const HISTORY_LIMIT = 20;

/**
 * Owns the conversation with Hermes.
 *
 * The context builder is a function rather than a value because the run changes
 * under the conversation — asking "is that good?" three minutes later should be
 * answered against what is on screen now, not against what was on screen when
 * the panel mounted.
 */
export function useHermes(buildContext: () => string) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [state, setState] = useState<BridgeState>("checking");
  const nextId = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/hermes")
      .then((response) => response.json())
      .then((payload: { available?: boolean }) => {
        if (!cancelled) setState(payload.available ? "ready" : "offline");
      })
      .catch(() => {
        if (!cancelled) setState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      const userTurn: ChatTurn = { id: (nextId.current += 1), role: "user", text: question };
      const answerId = (nextId.current += 1);

      // Built from the rendered turns rather than inside the state updater —
      // an updater is not guaranteed to have run by the time the request is
      // assembled, and a request with no history is a request with no question.
      const history = [...turns, userTurn];
      setTurns([...history, { id: answerId, role: "assistant", text: "" }]);

      setStreaming(true);
      const controller = new AbortController();
      abort.current = controller;

      const patch = (update: Partial<ChatTurn>) =>
        setTurns((previous) =>
          previous.map((turn) => (turn.id === answerId ? { ...turn, ...update } : turn)),
        );

      try {
        const response = await fetch("/api/hermes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            context: buildContext(),
            messages: history
              .slice(-HISTORY_LIMIT)
              .filter((turn) => !turn.failed && turn.text.trim().length > 0)
              .map((turn) => ({ role: turn.role, content: turn.text })),
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          patch({ text: payload.error ?? `Hermes returned ${response.status}`, failed: true });
          if (payload.reason === "unreachable") setState("offline");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const event = /^event: (.+)$/m.exec(frame)?.[1];
            const data = /^data: (.+)$/m.exec(frame)?.[1];
            if (!event || !data) continue;
            const payload = JSON.parse(data);

            if (event === "delta") {
              answer += payload.text;
              // The action block is hidden until it closes, so half-written
              // JSON never flickers through the prose.
              patch({ text: stripPendingFence(answer) });
            } else if (event === "error") {
              patch({ text: payload.error, failed: true });
              if (payload.reason === "unreachable") setState("offline");
              return;
            }
          }
        }

        const { text: prose, actions } = parseActions(answer);
        patch({ text: prose, actions });
        setState("ready");
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          patch({ text: "Lost the connection to Hermes", failed: true });
        }
      } finally {
        setStreaming(false);
        abort.current = null;
      }
    },
    [buildContext, streaming, turns],
  );

  const clear = useCallback(() => {
    stop();
    setTurns([]);
  }, [stop]);

  return { turns, send, stop, clear, streaming, state };
}
