"use client";

import { useEffect, useRef, useState } from "react";
import { complete } from "@/lib/terminal/commands";

export interface TerminalLine {
  readonly id: number;
  readonly tone: "input" | "output" | "error" | "note";
  readonly text: string;
}

interface TerminalProps {
  lines: TerminalLine[];
  onSubmit: (command: string) => void;
  /** Prints a line without running anything, used for completion hints. */
  onNote: (text: string) => void;
  busy: boolean;
}

const PROMPT = "hermes@lab:~$";

export function Terminal({ lines, onSubmit, onNote, busy }: TerminalProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const scrollback = useRef<HTMLDivElement>(null);

  // Keep the newest output in view without stealing focus from the input.
  useEffect(() => {
    const element = scrollback.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const command = value.trim();
    if (!command) return;
    setHistory((previous) => [command, ...previous].slice(0, 100));
    setCursor(-1);
    setValue("");
    onSubmit(command);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (history.length === 0) return;
      event.preventDefault();
      const next = event.key === "ArrowUp" ? Math.min(cursor + 1, history.length - 1) : cursor - 1;
      setCursor(next);
      setValue(next < 0 ? "" : history[next]);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const matches = complete(value);
      if (matches.length === 0) return;
      const parts = value.split(/\s+/);
      if (matches.length === 1) {
        parts[parts.length - 1] = matches[0];
        setValue(`${parts.join(" ")} `);
        return;
      }
      // Several candidates: fill in what they share, then list them.
      parts[parts.length - 1] = commonPrefix(matches);
      setValue(parts.join(" "));
      onNote(matches.join("  "));
    }
  };

  return (
    <>
      <div className="terminal-history" ref={scrollback} aria-live="polite" aria-label="Terminal output">
        {lines.map((line) => (
          <p key={line.id} className={`term-${line.tone}`}>
            {line.tone === "input" ? <span className="prompt">{PROMPT} </span> : null}
            {line.text}
          </p>
        ))}
      </div>
      <form className="terminal-input" onSubmit={submit}>
        <span className="prompt">❯</span>
        <input
          aria-label="Terminal command"
          placeholder={busy ? "running…" : "type help for the command list"}
          spellCheck={false}
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit">SEND ↵</button>
      </form>
    </>
  );
}

function commonPrefix(values: string[]): string {
  let prefix = values[0];
  for (const value of values) {
    while (!value.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
