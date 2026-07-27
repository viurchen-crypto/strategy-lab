"use client";

import { useEffect, useRef } from "react";
import { RichText } from "./rich-text";
import type { BridgeState, ChatTurn } from "./use-hermes";

const SUGGESTIONS = [
  "What is a Sharpe ratio, and is this one any good?",
  "Why is the out-of-sample half worse?",
  "Explain the strategy I have selected",
  "What would make this backtest untrustworthy?",
];

interface ChatPanelProps {
  turns: ChatTurn[];
  streaming: boolean;
  state: BridgeState;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Runs an offered action through the terminal's own command handler. */
  onCommand: (command: string) => void;
}

/**
 * The conversation. Deliberately narrow — it has to read well at 320px, docked
 * beside a chart, or full width on the learning page, so everything stacks and
 * nothing depends on horizontal room.
 */
export function ChatPanel({ turns, streaming, state, onSend, onStop, onCommand }: ChatPanelProps) {
  const log = useRef<HTMLDivElement>(null);

  // Follow the answer as it streams, without stealing focus from the input.
  useEffect(() => {
    const element = log.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns]);

  return (
    <div className="chat-body">
      <div className="chat-log" ref={log} aria-live="polite" aria-label="Conversation">
        {turns.length === 0 ? (
          <div className="chat-intro">
            {state === "offline" ? (
              <p className="chat-offline">
                Hermes runs on your machine, not on this server. Start the app locally with{" "}
                <code>npm run dev</code> and make sure the openai-oauth proxy is up.
              </p>
            ) : (
              <>
                <p>
                  Ask about anything on screen. I answer from this run&apos;s actual numbers, define
                  the terms as I go, and can offer to change the run — you decide whether to apply it.
                </p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button type="button" key={suggestion} onClick={() => onSend(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {turns.map((turn) => (
          <article
            key={turn.id}
            className={`chat-turn ${turn.role}${turn.failed ? " failed" : ""}`}
          >
            <span className="chat-role" aria-hidden="true">
              {turn.role === "user" ? "you" : "✦"}
            </span>
            <div className="chat-text">
              {turn.text ? (
                <RichText>{turn.text}</RichText>
              ) : (
                <p className="chat-thinking">
                  <span aria-hidden="true">●●●</span>
                  <span className="visually-hidden">Thinking</span>
                </p>
              )}
              {turn.actions && turn.actions.length > 0 ? (
                <div className="chat-actions">
                  {turn.actions.map((action) => (
                    <button
                      type="button"
                      key={action.command}
                      title={action.command}
                      onClick={() => onCommand(action.command)}
                    >
                      {action.label}
                      <code>{action.command}</code>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {streaming ? (
        <button type="button" className="chat-stop" onClick={onStop}>
          Stop
        </button>
      ) : null}
    </div>
  );
}
