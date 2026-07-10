// The bridge's agent-sdk turn shaping (entry/compose/chat.ts — the PD-7 wiring): splitting the shaped
// history into the SESSION SEED + the PROMPT TAIL, and the legacy flatten fallback. Load-bearing: the
// split decides whether a turn resumes a session (seed + tail) or runs the one-off flattened shape
// (continue-mode / tool rows), and the tail join must match the backend comparator's user-run joiner.

import type { TurnMessage } from "@orb/server/domain/chat";
import { flattenAgentHistory, splitAgentHistory } from "@orb/server/entry/compose";
import { AGENT_PROMPT_TAIL_JOINER } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

function row(role: TurnMessage["role"], text: string, name?: string): TurnMessage {
  const content: TurnMessage["content"] = [{ type: "text", text }];
  return name !== undefined ? { role, content, name } : { role, content };
}

describe("splitAgentHistory — seed + prompt tail", () => {
  test("splits at the last assistant row: prior turns seed, the trailing user rows are the prompt", () => {
    const split = splitAgentHistory([
      row("user", "hello"),
      row("assistant", "hi there"),
      row("user", "next question"),
    ]);
    expect(split).not.toBeNull();
    expect(split?.seed).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(split?.prompt).toBe("next question");
  });

  test("a multi-row user tail joins with the contract joiner (the comparator's user-run rule)", () => {
    const split = splitAgentHistory([
      row("assistant", "greeting"),
      row("user", "part a"),
      row("user", "part b"),
    ]);
    expect(split?.prompt).toBe(`part a${AGENT_PROMPT_TAIL_JOINER}part b`);
    expect(split?.seed).toEqual([{ role: "assistant", content: "greeting" }]);
  });

  test("the wire `name` label is stamped into seed + prompt text (frames carry no name field)", () => {
    const split = splitAgentHistory([
      row("user", "hello", "Alice"),
      row("assistant", "hi", "Nyx"),
      row("user", "and then?", "Alice"),
    ]);
    expect(split?.seed).toEqual([
      { role: "user", content: "Alice: hello" },
      { role: "assistant", content: "Nyx: hi" },
    ]);
    expect(split?.prompt).toBe("Alice: and then?");
  });

  test("a FIRST turn (no assistant yet) is all-tail with an empty seed", () => {
    const split = splitAgentHistory([row("user", "opening line")]);
    expect(split?.seed).toEqual([]);
    expect(split?.prompt).toBe("opening line");
  });

  test("an assistant-FINAL history (continue-mode) returns null — the caller falls back to flatten", () => {
    expect(splitAgentHistory([row("user", "go"), row("assistant", "partial reply")])).toBeNull();
  });

  test("a tool row anywhere returns null (tools never ride the agent-sdk arm)", () => {
    expect(
      splitAgentHistory([row("user", "go"), row("tool", "result"), row("user", "next")]),
    ).toBeNull();
  });

  test("an empty-text tail returns null rather than sending a blank prompt", () => {
    expect(splitAgentHistory([row("assistant", "greeting"), row("user", "")])).toBeNull();
  });
});

describe("flattenAgentHistory — the fallback shape", () => {
  test("labels roles (with parenthesized names) and joins rows — the pre-PD-7 byte shape", () => {
    const prompt = flattenAgentHistory([row("user", "hello", "Alice"), row("assistant", "hi")]);
    expect(prompt).toBe("User (Alice): hello\n\nAssistant: hi");
  });
});
