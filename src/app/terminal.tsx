"use client";

import { useEffect, useRef, useState } from "react";
import { complete } from "@/lib/terminal/commands";

export interface TerminalLine {
  readonly id: number;
  readonly tone: "input" | "output" | "error" | "note";
  readonly text: string;
}

const PROMPT = "hermes@lab:~$";

/**
 * The scrollback lives in the workspace tab; the input lives in the dock at the
 * bottom of the page. Splitting them keeps a command line permanently in reach
 * without the log having to occupy a panel at all times.
 */
export function TerminalLog({ lines }: { lines: TerminalLine[] }) {
  const scrollback = useRef<HTMLDivElement>(null);

  // Keep the newest output in view without stealing focus from the input.
  useEffect(() => {
    const element = scrollback.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <div className="terminal-history" ref={scrollback} aria-live="polite" aria-label="Terminal output">
      {lines.length === 0 ? <p className="term-note">Cleared.</p> : null}
      {lines.map((line) => (
        <p key={line.id} className={`term-${line.tone}`}>
          {line.tone === "input" ? <span className="prompt">{PROMPT} </span> : null}
          {line.text}
        </p>
      ))}
    </div>
  );
}

interface CommandLineProps {
  onSubmit: (command: string) => void;
  /** Prints a line without running anything, used for completion hints. */
  onNote: (text: string) => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function CommandLine({ onSubmit, onNote, busy, inputRef }: CommandLineProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);

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
    if (event.key === "Escape") {
      setValue("");
      event.currentTarget.blur();
      return;
    }

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
    <form className="commandline" onSubmit={submit}>
      <span className={busy ? "prompt busy" : "prompt"} aria-hidden="true">
        {busy ? "◴" : "❯"}
      </span>
      <input
        ref={inputRef}
        aria-label="Terminal command"
        aria-describedby="commandline-hint"
        placeholder={busy ? "running…" : "type a command — help lists them all"}
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="commandline-hint" id="commandline-hint">
        Tab completes · ↑ recalls · ` focuses
      </span>
      <button type="submit">RUN ↵</button>
    </form>
  );
}

function commonPrefix(values: string[]): string {
  let prefix = values[0];
  for (const value of values) {
    while (!value.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
