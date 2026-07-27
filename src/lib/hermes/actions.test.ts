import { describe, expect, it } from "vitest";
import { ACTION_FENCE, parseActions, stripPendingFence } from "./actions";

const fence = (body: string) => "```" + ACTION_FENCE + "\n" + body + "\n```";

describe("hermes action parsing", () => {
  it("extracts a valid action and removes the block from the prose", () => {
    const message = `A Sharpe ratio is return per unit of volatility.\n\n${fence(
      '{"actions":[{"label":"Run on weekly bars","command":"tf 1W"}]}',
    )}`;

    const { text, actions } = parseActions(message);
    expect(text).toBe("A Sharpe ratio is return per unit of volatility.");
    expect(actions).toEqual([{ label: "Run on weekly bars", command: "tf 1W" }]);
  });

  it("accepts a bare array, which models emit as often as the envelope", () => {
    const { actions } = parseActions(fence('[{"label":"Bitcoin","command":"symbol BTC-USD"}]'));
    expect(actions).toHaveLength(1);
  });

  it("keeps several actions but drops duplicates", () => {
    const { actions } = parseActions(
      fence(
        '{"actions":[{"label":"A","command":"tf 1W"},{"label":"B","command":"TF 1W"},' +
          '{"label":"C","command":"top 5"}]}',
      ),
    );
    expect(actions.map((action) => action.command)).toEqual(["tf 1W", "top 5"]);
  });

  it.each([
    ["a shell verb", '{"actions":[{"label":"x","command":"rm -rf /"}]}'],
    ["a shell pipe", '{"actions":[{"label":"x","command":"top 5 | sh"}]}'],
    ["a substitution", '{"actions":[{"label":"x","command":"symbol $(whoami)"}]}'],
    ["a backtick", '{"actions":[{"label":"x","command":"symbol `id`"}]}'],
    ["a newline", '{"actions":[{"label":"x","command":"tf 1W\\nrm file"}]}'],
    ["an unknown verb", '{"actions":[{"label":"x","command":"deploy production"}]}'],
    ["a destructive verb", '{"actions":[{"label":"x","command":"clear"}]}'],
    ["an export", '{"actions":[{"label":"x","command":"export"}]}'],
    ["a nested object", '{"actions":[{"label":"x","command":{"toString":"tf 1W"}}]}'],
    ["a missing label", '{"actions":[{"command":"tf 1W"}]}'],
    ["broken json", "{not json at all"],
    ["an oversized command", `{"actions":[{"label":"x","command":"symbol ${"A".repeat(200)}"}]}`],
  ])("rejects %s", (_name, body) => {
    const { actions } = parseActions(`Here you go.\n\n${fence(body)}`);
    expect(actions).toEqual([]);
  });

  it("still removes the block when the payload is rejected, so no JSON leaks into the prose", () => {
    const { text } = parseActions(`Explanation.\n\n${fence('{"actions":[{"command":"rm -rf /"}]}')}`);
    expect(text).toBe("Explanation.");
    expect(text).not.toContain("rm");
  });

  it("caps how many actions one reply may offer", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      label: `${index}`,
      command: `top ${index + 1}`,
    }));
    const { actions } = parseActions(fence(JSON.stringify({ actions: many })));
    expect(actions).toEqual([]);
  });

  it("hides an unclosed fence while the reply is still streaming", () => {
    const partial = 'Some prose.\n\n```' + ACTION_FENCE + '\n{"actions":[{"lab';
    expect(stripPendingFence(partial)).toBe("Some prose.\n\n");
  });

  it("leaves a closed fence alone for the parser to handle", () => {
    const complete = `Prose.\n\n${fence('{"actions":[]}')}`;
    expect(stripPendingFence(complete)).toBe(complete);
  });
});
