import { z } from "zod";
import { COMMANDS } from "../terminal/commands";

/**
 * The containment boundary.
 *
 * Hermes is a language model with a shell, a filesystem and a network on the
 * machine this app runs on. None of that reaches the app: the only thing the
 * model can ask the interface to do is emit a line in the terminal's own
 * command language, which then goes through `runCommand` — the same validator
 * a typed command goes through, with the same bounds on every argument.
 *
 * So the worst a compromised or confused model can do is run a backtest you
 * did not ask for. It cannot express anything else, because there is no syntax
 * here for anything else.
 */
export const ACTION_FENCE = "lab-action";

/** Verbs the model may emit. A subset of the terminal's, minus the destructive ones. */
const ALLOWED = new Set<string>([
  ...COMMANDS.filter((command) => command !== "clear" && command !== "export"),
  "compare",
  "horizon",
  "open",
  "go",
]);

/** One line, printable ASCII, bounded — a command, not a payload. */
const CommandSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9 ._^=:/-]+$/, "unsupported characters")
  .refine((line) => ALLOWED.has(line.split(/\s+/)[0].toLowerCase()), "unknown verb");

const ActionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  command: CommandSchema,
});

const EnvelopeSchema = z.object({
  actions: z.array(ActionSchema).max(4),
});

export type LabAction = z.infer<typeof ActionSchema>;

const FENCE = new RegExp("```" + ACTION_FENCE + "\\s*([\\s\\S]*?)```", "g");

/**
 * Splits an assistant message into prose and offered actions. Anything that
 * fails validation is dropped silently rather than surfaced as a broken button:
 * a malformed action is the model's mistake to swallow, not the reader's to
 * decipher. The prose is returned with the blocks removed either way.
 */
export function parseActions(message: string): { text: string; actions: LabAction[] } {
  const actions: LabAction[] = [];
  const seen = new Set<string>();

  const text = message.replace(FENCE, (_match, body: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return "";
    }

    // A bare array or a single action are both common model outputs; accept them.
    const candidate = Array.isArray(parsed) ? { actions: parsed } : parsed;
    const envelope = EnvelopeSchema.safeParse(candidate);
    if (!envelope.success) return "";

    for (const action of envelope.data.actions) {
      const key = action.command.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push(action);
    }
    return "";
  });

  return { text: text.trim(), actions };
}

/**
 * A partial stream ends mid-block more often than not. Hiding the tail of an
 * unclosed fence keeps raw JSON from flashing on screen as it arrives.
 */
export function stripPendingFence(message: string): string {
  const opening = message.lastIndexOf("```" + ACTION_FENCE);
  if (opening === -1) return message;
  const closing = message.indexOf("```", opening + ACTION_FENCE.length + 3);
  return closing === -1 ? message.slice(0, opening) : message;
}
