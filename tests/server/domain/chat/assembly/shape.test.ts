// SHAPE substrate: shape() + computeHistoryBreakpoint (chat.md Part II §2 SHAPE, §3, §8; Part III §12
// inv 1 + 7). The cross-repo byte-parity vs neo lives in the .parity.test; THIS pins the orbweaver-side
// invariants directly: the 3 breakpoint-undefined cases, the offset/clamp/floor math, the neo-quirk →
// undefined divergence, and the no-if(isGroup) solo-byte-identical contract.
import type { ChatInjection } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  computeHistoryBreakpoint,
  shape,
} from "../../../../../packages/server/src/domain/chat/assembly/shape";

const ARIA = castId<CharacterId>("character_aria");
const KAI = castId<CharacterId>("character_kai");
const SPEAKERS = { user: "User", assistant: "Aria" };

// A clean 3-row solo canon (asst greeting, user, asst tip) — the prior tip is the last stable message.
const SOLO_CANON = [
  { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
  { role: "user" as const, content: "u1", authorName: "User" },
  { role: "assistant" as const, content: "a1 tip", authorName: "Aria", characterId: ARIA },
];

function soloInput(over: Partial<Parameters<typeof shape>[0]> = {}): Parameters<typeof shape>[0] {
  return {
    canon: SOLO_CANON,
    appendUserTurn: "u2 volatile",
    injections: [],
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: "default",
    speakers: SPEAKERS,
    groupNudge: null,
    ...over,
  };
}

const inChat = (over: Partial<ChatInjection>): ChatInjection => ({
  position: "in_chat",
  depth: 0,
  role: "user",
  content: "x",
  ...over,
});

describe("shape — the breakpoint", () => {
  test("clean send: breakpoint pins the prior tip (offset 1)", () => {
    const out = shape(soloInput());
    expect(out.cacheBreakpointFromEnd).toBe(1);
    // History ends on the volatile user turn; the prior tip is at index history.length-2.
    expect(out.history.at(-1)).toEqual({ role: "user", content: "u2 volatile" });
  });

  test("offset is invariant to prefix length (still 1 on a longer clean canon)", () => {
    const longer = [
      ...SOLO_CANON,
      { role: "user" as const, content: "u2", authorName: "User" },
      { role: "assistant" as const, content: "a2 tip", authorName: "Aria", characterId: ARIA },
    ];
    expect(shape(soloInput({ canon: longer, appendUserTurn: "u3" })).cacheBreakpointFromEnd).toBe(
      1,
    );
  });

  test("ABORT #1: a depth≥2 in_chat injection → undefined", () => {
    expect(
      shape(soloInput({ injections: [inChat({ depth: 2, content: "deep" })] }))
        .cacheBreakpointFromEnd,
    ).toBeUndefined();
  });

  test("ABORT #2: a depth-1 assistant injection squash-merges the boundary → undefined", () => {
    expect(
      shape(soloInput({ injections: [inChat({ depth: 1, role: "assistant", content: "cont" })] }))
        .cacheBreakpointFromEnd,
    ).toBeUndefined();
  });

  test("ABORT #3: a group nudge appends a second volatile tail → undefined", () => {
    expect(
      shape(soloInput({ groupNudge: "[Write the next reply only as Aria.]" }))
        .cacheBreakpointFromEnd,
    ).toBeUndefined();
  });

  test("first turn (no stable prefix) → undefined", () => {
    expect(
      shape(soloInput({ canon: [], appendUserTurn: "first" })).cacheBreakpointFromEnd,
    ).toBeUndefined();
  });

  test("narrator force round (ends on assistant → CONTINUATION_NUDGE) → undefined + a user tail", () => {
    const out = shape(
      soloInput({
        canon: SOLO_CANON,
        appendUserTurn: null,
        output: "narrator",
        cardScope: "merged",
      }),
    );
    expect(out.cacheBreakpointFromEnd).toBeUndefined();
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Continue the conversation.]" });
  });

  test("a depth-0 injection squash-merges into the tail and leaves the breakpoint at offset 1", () => {
    const out = shape(soloInput({ injections: [inChat({ depth: 0, content: "steer" })] }));
    expect(out.cacheBreakpointFromEnd).toBe(1);
    expect(out.history.at(-1)).toEqual({
      role: "user",
      content: "u2 volatile\n\n[Note from user: steer]",
    });
  });
});

describe("shape — no-if(isGroup): solo is byte-identical", () => {
  test("a solo per-speaker/merged round adds no prefix + no nudge + no scope fold", () => {
    const out = shape(soloInput());
    expect(out.stages.multiCharacter).toBe(false);
    expect(out.history).toEqual([
      { role: "assistant", content: "greeting" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1 tip" },
      { role: "user", content: "u2 volatile" },
    ]);
  });
});

describe("shape — egocentric scoped fold (the neo-quirk → undefined)", () => {
  test("scoped per-speaker targeting Kai folds Aria's turns to user + collapses; breakpoint undefined", () => {
    const groupCanon = [
      { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
      { role: "user" as const, content: "u1", authorName: "User" },
      {
        role: "assistant" as const,
        content: "Aria replies",
        authorName: "Aria",
        characterId: ARIA,
      },
      { role: "assistant" as const, content: "Kai replies", authorName: "Kai", characterId: KAI },
    ];
    const out = shape(
      soloInput({
        canon: groupCanon,
        appendUserTurn: "u2 to Kai",
        cardScope: "scoped",
        scopedTargetId: KAI,
        speakers: { user: "User", assistant: "Kai" },
      }),
    );
    // The fold collapses Aria's rows + u1 into one user row; Kai's own row stays assistant.
    expect(out.history).toEqual([
      { role: "user", content: "Aria: greeting\n\nu1\n\nAria: Aria replies" },
      { role: "assistant", content: "Kai replies" },
      { role: "user", content: "u2 to Kai" },
    ]);
    // The prefix-collapse violates the single-volatile-tail invariant → orbweaver returns undefined
    // (neo's degenerate -1, corrected). chat.md Part III §12 inv 7.
    expect(out.cacheBreakpointFromEnd).toBeUndefined();
  });
});

describe("computeHistoryBreakpoint — direct math", () => {
  const u = (content: string): { role: "user"; content: string } => ({ role: "user", content });
  const a = (content: string): { role: "assistant"; content: string } => ({
    role: "assistant",
    content,
  });

  test("clean 4-row final, stableCount 3 → offset 1", () => {
    const withTail = [a("g"), u("u1"), a("tip"), u("vol")];
    expect(computeHistoryBreakpoint(withTail, withTail, withTail, [])).toBe(1);
  });

  test("stableCount < 1 (only the volatile tail) → undefined", () => {
    const withTail = [u("only")];
    expect(computeHistoryBreakpoint(withTail, withTail, withTail, [])).toBeUndefined();
  });

  test("a negative offset (collapsed prefix, finalLen < stableCount) → undefined (the quirk guard)", () => {
    const withTail = [u("a"), u("b"), u("c"), a("k"), u("vol")]; // stableCount 4
    const collapsed = [u("a\n\nb\n\nc"), a("k"), u("vol")]; // finalLen 3 → raw offset -1
    expect(computeHistoryBreakpoint(withTail, withTail, collapsed, [])).toBeUndefined();
  });
});
