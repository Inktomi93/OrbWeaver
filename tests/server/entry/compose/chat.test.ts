// The bridge's agent-sdk turn shaping (entry/compose/chat.ts — the PD-7 wiring): splitting the shaped
// history into the SESSION SEED + the PROMPT TAIL, and the legacy flatten fallback. Load-bearing: the
// split decides whether a turn resumes a session (seed + tail) or runs the one-off flattened shape
// (continue-mode / tool rows), and the tail join must match the backend comparator's user-run joiner.

import type { TurnMessage } from "@orb/server/domain/chat";
import { extractTrailingSystemRows, flattenAgentHistory, splitAgentHistory } from "@orb/server/entry/compose";
import { AGENT_PROMPT_TAIL_JOINER } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

function row(role: TurnMessage["role"], text: string, name?: string): TurnMessage {
  const content: TurnMessage["content"] = [{ type: "text", text }];
  return name !== undefined ? { role, content, name } : { role, content };
}

describe("splitAgentHistory — seed + prompt tail", () => {
  test("splits at the last assistant row: prior turns seed, the trailing user rows are the prompt", () => {
    const split = splitAgentHistory([row("user", "hello"), row("assistant", "hi there"), row("user", "next question")]);
    expect(split).not.toBeNull();
    expect(split?.seed).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(split?.prompt).toBe("next question");
  });

  test("a multi-row user tail joins with the contract joiner (the comparator's user-run rule)", () => {
    const split = splitAgentHistory([row("assistant", "greeting"), row("user", "part a"), row("user", "part b")]);
    expect(split?.prompt).toBe(`part a${AGENT_PROMPT_TAIL_JOINER}part b`);
    expect(split?.seed).toEqual([{ role: "assistant", content: "greeting" }]);
  });

  test("the wire `name` label is stamped into seed + prompt text (frames carry no name field)", () => {
    const split = splitAgentHistory([row("user", "hello", "Alice"), row("assistant", "hi", "Nyx"), row("user", "and then?", "Alice")]);
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
    expect(splitAgentHistory([row("user", "go"), row("tool", "result"), row("user", "next")])).toBeNull();
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

describe("extractTrailingSystemRows — the agent-sdk system-injection channel split", () => {
  test("splits trailing system rows off; their text joins for the dynamic hook; the remaining tail still splits cleanly", () => {
    const history = [row("user", "hello"), row("assistant", "hi"), row("user", "next"), row("system", "GM note A"), row("system", "GM note B")];
    const { rows, systemText } = extractTrailingSystemRows(history);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user"]);
    expect(systemText).toBe(`GM note A${AGENT_PROMPT_TAIL_JOINER}GM note B`);
    // The volatile injection never enters the transcript, so the seed comparator matches next turn
    // (resume, not reseed) and the prompt stays the clean user tail.
    const split = splitAgentHistory(rows);
    expect(split?.prompt).toBe("next");
    expect(split?.seed.map((s) => s.role)).toEqual(["user", "assistant"]);
  });

  // F3 — the NUDGE-TAIL shape: SHAPE appends the group/CONTINUATION nudge as a trailing USER row AFTER the
  // depth-0 system reminder (`[…, assistant, system, user-nudge]`), so the system row is NOT tail-final. A pure
  // trailing-run scan missed it and let the reminder fall BARE into the prompt tail (unframed system authority
  // reaching the model as user content + entering the transcript → reseed churn). The lift must reach the
  // system row THROUGH the nudge tail; the nudge (a real user turn) stays in `rows`.
  test("F3: a system row with a trailing user NUDGE after it is still lifted (the nudge stays a user turn)", () => {
    const history = [row("user", "hello"), row("assistant", "hi"), row("system", "GM reminder"), row("user", "[Continue the conversation.]")];
    const { rows, systemText } = extractTrailingSystemRows(history);
    // The system band is lifted to the hook; the canon head + the nudge tail remain (nudge is a user turn).
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user"]);
    expect(systemText).toBe("GM reminder");
    // splitAgentHistory now sees a clean [user, assistant] seed + the NUDGE as the prompt — the reminder never
    // enters the prompt tail bare, and never enters the transcript (resume, not reseed).
    const split = splitAgentHistory(rows);
    expect(split?.prompt).toBe("[Continue the conversation.]");
    expect(split?.seed.map((s) => s.role)).toEqual(["user", "assistant"]);
    // The reminder text is NOT in the prompt (the F3 defect was it landing here bare).
    expect(split?.prompt).not.toContain("GM reminder");
  });

  // The multi-system + nudge composite (a squashed system run can precede the nudge too).
  test("F3: multiple system rows THEN a nudge — the whole system band lifts, nudge preserved", () => {
    const history = [row("user", "go"), row("assistant", "ok"), row("system", "note A"), row("system", "note B"), row("user", "[Continue the conversation.]")];
    const { rows, systemText } = extractTrailingSystemRows(history);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user"]);
    expect(systemText).toBe(`note A${AGENT_PROMPT_TAIL_JOINER}note B`);
  });

  test("no trailing system rows → identity (systemText null, rows by reference)", () => {
    const history = [row("user", "hello")];
    const out = extractTrailingSystemRows(history);
    expect(out.systemText).toBeNull();
    expect(out.rows).toBe(history);
  });

  test("flattenAgentHistory labels a system row 'System' (the no-split fallback stays honest)", () => {
    expect(flattenAgentHistory([row("system", "note")])).toBe("System: note");
  });
});
