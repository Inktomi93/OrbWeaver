// SHAPE substrate: shape() + computeHistoryBreakpoint (chat.md Part II §2 SHAPE, §3, §8; Part III §12
// inv 1 + 7). The cross-repo byte-parity vs neo lives in the .parity.test; THIS pins the orbweaver-side
// invariants directly: the 3 breakpoint-undefined cases, the offset/clamp/floor math, the neo-quirk →
// undefined divergence, and the no-if(isGroup) solo-byte-identical contract.
import type { ChatInjection } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { computeHistoryBreakpoint, shape } from "../../../../../packages/server/src/domain/chat/assembly/shape";
import { expect, test } from "../../../../support/fixtures";

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
    expect(shape(soloInput({ canon: longer, appendUserTurn: "u3" })).cacheBreakpointFromEnd).toBe(1);
  });

  test("ABORT #1: a depth≥2 in_chat injection → undefined", () => {
    expect(shape(soloInput({ injections: [inChat({ depth: 2, content: "deep" })] })).cacheBreakpointFromEnd).toBeUndefined();
  });

  // D66-C (W6) — the prefix-stable fix supersedes the old ABORT #2 for this case. A depth-1 assistant
  // injection landing same-role against the last stable canon row is RE-FRAMED at the splice to a user
  // operator note (`[Note from user: …]`), so it NEVER folds into the cached prefix. The stable prefix is
  // byte-identical → the breakpoint is now VALID (offset 1), not aborted, and the whole-conversation
  // re-bill (part 01 §1c) is prevented.
  test("W6 prefix-stable: a depth-1 assistant injection re-frames to a user note; the breakpoint HOLDS (offset 1)", () => {
    const out = shape(soloInput({ injections: [inChat({ depth: 1, role: "assistant", content: "cont" })] }));
    expect(out.cacheBreakpointFromEnd).toBe(1);
    // The stable prefix is untouched; the re-framed note rides on the volatile user tail.
    expect(out.history).toEqual([
      { role: "assistant", content: "greeting" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1 tip" },
      { role: "user", content: "[Note from user: cont]\n\nu2 volatile" },
    ]);
  });

  test("ABORT #3: a group nudge appends a second volatile tail → undefined", () => {
    expect(shape(soloInput({ groupNudge: "[Write the next reply only as Aria.]" })).cacheBreakpointFromEnd).toBeUndefined();
  });

  test("first turn (no stable prefix) → undefined", () => {
    expect(shape(soloInput({ canon: [], appendUserTurn: "first" })).cacheBreakpointFromEnd).toBeUndefined();
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

  // F5 (sim-breakpoint): a group-canon prefix with two back-to-back single-speaker rounds (a1 by Aria,
  // a2 by Kai) + an assistant-role depth-0 guided injection (normalized to depth 1 at the boundary). The
  // old math pinned the per-turn injection; the fix lands on u2 (offset 2).
  test("group-canon back-to-back rounds + a boundary injection → offset pins the last real message", () => {
    const groupCanon = [
      { role: "assistant" as const, content: "a0 greeting", authorName: "Aria", characterId: ARIA },
      { role: "user" as const, content: "u1", authorName: "User" },
      { role: "assistant" as const, content: "a1 by Aria", authorName: "Aria", characterId: ARIA },
      { role: "assistant" as const, content: "a2 by Kai", authorName: "Kai", characterId: KAI },
      { role: "user" as const, content: "u2 latest", authorName: "User" },
    ];
    const out = shape(
      soloInput({
        canon: groupCanon,
        appendUserTurn: "[regen prompt]",
        namesBehavior: "none",
        injections: [inChat({ depth: 0, role: "assistant", content: "[per-turn steer]" })],
      }),
    );
    expect(out.cacheBreakpointFromEnd).toBe(2);
    const idx = out.history.length - (out.cacheBreakpointFromEnd ?? 0) - 1;
    expect(out.history[idx]).toEqual({ role: "user", content: "u2 latest" });
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

describe("shape — F2: adjacent distinct-character rows keep EACH speaker's label", () => {
  // The repro (reports/stickler/scratch/repro-squash-attrib.ts): a per-speaker group round commits two
  // ADJACENT assistant rows from different characters. squash ran BEFORE the name-stamp, so Kai's line was
  // delivered under Aria's name. The fix stamps names before the FINAL squash → the merged block carries
  // BOTH labels.
  const groupCanon = [
    { role: "user" as const, content: "What do you two think?", authorName: "Alex" },
    {
      role: "assistant" as const,
      content: "I think we should go north.",
      authorName: "Aria",
      characterId: ARIA,
    },
    {
      role: "assistant" as const,
      content: "No, south is safer.",
      authorName: "Kai",
      characterId: KAI,
    },
  ];

  test('"default" (multiCharacter): the merged assistant block keeps both "Aria:" and "Kai:"', () => {
    const out = shape(soloInput({ canon: groupCanon, appendUserTurn: null, namesBehavior: "default" }));
    expect(out.stages.multiCharacter).toBe(true);
    const assistant = out.history.find((r) => r.role === "assistant");
    expect(assistant?.content).toBe("Aria: I think we should go north.\n\nKai: No, south is safer.");
    // Kai's line is attributed to Kai, not swallowed under Aria.
    expect(assistant?.content).toContain("Kai: No, south is safer.");
  });

  test('"content": both rows are labeled by their own author', () => {
    const out = shape(soloInput({ canon: groupCanon, appendUserTurn: null, namesBehavior: "content" }));
    const assistant = out.history.find((r) => r.role === "assistant");
    expect(assistant?.content).toBe("Aria: I think we should go north.\n\nKai: No, south is safer.");
  });

  test('"completion": distinct authors stay UNMERGED so each keeps its own wire `name`', () => {
    const out = shape(soloInput({ canon: groupCanon, appendUserTurn: null, namesBehavior: "completion" }));
    const asst = out.history.filter((r) => r.role === "assistant");
    expect(asst).toEqual([
      { role: "assistant", content: "I think we should go north.", name: "Aria" },
      { role: "assistant", content: "No, south is safer.", name: "Kai" },
    ]);
  });

  test("a genuine same-speaker adjacent run still merges cleanly (default, multiCharacter)", () => {
    // Aria speaks twice adjacently in a 2-character room — still ONE merged assistant row.
    const out = shape(
      soloInput({
        canon: [
          { role: "user" as const, content: "u1", authorName: "Alex" },
          { role: "assistant" as const, content: "First.", authorName: "Aria", characterId: ARIA },
          { role: "assistant" as const, content: "Second.", authorName: "Aria", characterId: ARIA },
          { role: "assistant" as const, content: "Kai here.", authorName: "Kai", characterId: KAI },
        ],
        appendUserTurn: null,
        namesBehavior: "default",
      }),
    );
    const assistant = out.history.find((r) => r.role === "assistant");
    expect(assistant?.content).toBe("Aria: First.\n\nAria: Second.\n\nKai: Kai here.");
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
    expect(computeHistoryBreakpoint(withTail, withTail, withTail, { injections: [] })).toBe(1);
  });

  test("stableCount < 1 (only the volatile tail) → undefined", () => {
    const withTail = [u("only")];
    expect(computeHistoryBreakpoint(withTail, withTail, withTail, { injections: [] })).toBeUndefined();
  });

  test("scoped-fold collapse (finalLen < stableCount) → undefined (the quirk guard)", () => {
    const withTail = [u("a"), u("b"), u("c"), a("k"), u("vol")]; // stableCount 4
    const collapsed = [u("a\n\nb\n\nc"), a("k"), u("vol")]; // finalLen 3 → raw offset -1
    expect(
      computeHistoryBreakpoint(withTail, withTail, collapsed, {
        injections: [],
        scopedFold: true,
      }),
    ).toBeUndefined();
  });

  // F5: GROUP canon — two back-to-back single-speaker rounds (…a1, a2…) are adjacent same-role rows that
  // squash INSIDE the stable prefix; a depth-1 assistant injection splices at the boundary and masks the
  // collapse. The old `finalLen - stableCount` pinned the per-turn injection (wrong-but-positive); counting
  // from the squashed prefix length pins the true last-stable message (u2) at offset 2.
  test("group-canon prefix merge + a boundary injection → offset lands on the last stable message", () => {
    // withTail = [a0, u1, a1, a2, u2, regen]; stableCount 5. injected splices an assistant note between u2
    // and the volatile regen. squash merges a1+a2 → the final is [a0, u1, a1a2, u2, note, regen] (len 6).
    const withTail = [a("a0"), u("u1"), a("a1"), a("a2"), u("u2"), u("regen")];
    const injected = [a("a0"), u("u1"), a("a1"), a("a2"), u("u2"), a("note"), u("regen")];
    const final = [a("a0"), u("u1"), a("a1\n\na2"), u("u2"), a("note"), u("regen")];
    const offset = computeHistoryBreakpoint(withTail, injected, final, {
      injections: [{ position: "in_chat", depth: 0 }],
    });
    expect(offset).toBe(2);
    // The tag must pin u2 (the last real message), NOT the per-turn injection at index 4.
    expect(final.at(-(offset ?? 0) - 1)).toEqual({ role: "user", content: "u2" });
  });
});

// D66 (W5) — prefill at SHAPE (ruling A): the CONTINUATION_NUDGE + the splice assistant@0 floor are gated
// on the resolved `turns.assistantPrefill`. The trailing-user invariant asserts BOTH arms.
describe("shape — W5 assistantPrefill gates the trailing-user invariant", () => {
  // A canon that ENDS ON ASSISTANT with no appended user turn (a force/auto round).
  const trailingAssistantInput = (assistantPrefill: boolean): Parameters<typeof shape>[0] =>
    soloInput({ canon: SOLO_CANON, appendUserTurn: null, assistantPrefill });

  test("assistantPrefill=false (default floor): a trailing-assistant history gets the CONTINUATION_NUDGE (ends on user)", () => {
    const out = shape(trailingAssistantInput(false));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Continue the conversation.]" });
  });

  test("assistantPrefill=true: the trailing assistant is DELIVERED verbatim (no nudge — the model continues the prefill)", () => {
    const out = shape(trailingAssistantInput(true));
    expect(out.history.at(-1)).toEqual({ role: "assistant", content: "a1 tip" });
    // No injected user continuation cue anywhere.
    expect(out.history.some((r) => r.content.includes("Continue the conversation"))).toBe(false);
  });

  test("assistantPrefill=true: an assistant@depth-0 injection STAYS at depth 0 (the honored prefill tail)", () => {
    // With prefill on + a trailing user turn, the assistant@0 injection is the LAST wire row (the prefill).
    const out = shape(
      soloInput({
        injections: [inChat({ depth: 0, role: "assistant", content: "The night was" })],
        assistantPrefill: true,
      }),
    );
    expect(out.history.at(-1)).toEqual({ role: "assistant", content: "The night was" });
  });

  test("assistantPrefill=false: an assistant@depth-0 injection is FLOORED to depth 1 (never a trailing prefill)", () => {
    const out = shape(
      soloInput({
        injections: [inChat({ depth: 0, role: "assistant", content: "The night was" })],
        assistantPrefill: false,
      }),
    );
    // The note floors to depth 1 (before the user tail) — and since it now lands same-role against the
    // assistant stable tail ("a1 tip"), the W6 prefix-stable re-frame converts it to a user operator note
    // riding on the volatile user tail. Either way it is NEVER a trailing assistant prefill row.
    expect(out.history.at(-1)).toEqual({
      role: "user",
      content: "[Note from user: The night was]\n\nu2 volatile",
    });
    expect(out.history.at(-1)?.role).toBe("user");
  });
});

// D66-C (W6) — the role-handling knob at SHAPE: `none` skips ALL merging; the prefix-stable re-frame keeps
// the cached prefix byte-identical under every merging strategy.
describe("shape — W6 role-handling strategy + prefix-stable goldens", () => {
  test("roleHandling=none: adjacent same-role group rows are NOT merged (rows stay standalone)", () => {
    const groupCanon = [
      { role: "user" as const, content: "u1", authorName: "Alex" },
      { role: "assistant" as const, content: "First.", authorName: "Aria", characterId: ARIA },
      { role: "assistant" as const, content: "Second.", authorName: "Kai", characterId: KAI },
    ];
    const out = shape(
      soloInput({
        canon: groupCanon,
        appendUserTurn: null,
        namesBehavior: "none",
        roleHandling: "none",
        roleHandlingFloor: "none",
      }),
    );
    // No merge: the two adjacent assistant rows remain separate.
    expect(out.history.filter((r) => r.role === "assistant")).toEqual([
      { role: "assistant", content: "First." },
      { role: "assistant", content: "Second." },
    ]);
  });

  test("roleHandling=merge (default floor): the same adjacent assistant rows MERGE (today-behavior)", () => {
    const groupCanon = [
      { role: "user" as const, content: "u1", authorName: "Alex" },
      { role: "assistant" as const, content: "First.", authorName: "Aria", characterId: ARIA },
      { role: "assistant" as const, content: "Second.", authorName: "Kai", characterId: KAI },
    ];
    const out = shape(
      soloInput({
        canon: groupCanon,
        appendUserTurn: null,
        namesBehavior: "none",
        roleHandling: "merge",
        roleHandlingFloor: "merge",
      }),
    );
    expect(out.history.filter((r) => r.role === "assistant")).toEqual([{ role: "assistant", content: "First.\n\nSecond." }]);
  });

  test("prefix-stable golden: the STABLE prefix bytes are IDENTICAL with and without an active boundary injection", () => {
    // The re-frame keeps the cached prefix byte-for-byte the same whether or not the depth-1 assistant note
    // is active — the whole-conversation re-bill (part 01 §1c) is prevented.
    const clean = shape(soloInput({ injections: [] }));
    const withNote = shape(soloInput({ injections: [inChat({ depth: 1, role: "assistant", content: "steer" })] }));
    // The stable prefix (everything but the last, volatile, row) is identical.
    expect(withNote.history.slice(0, -1)).toEqual(clean.history.slice(0, -1));
    // Only the volatile tail differs (the re-framed note rides on it), and the breakpoint still holds.
    expect(withNote.cacheBreakpointFromEnd).toBe(1);
    expect(withNote.history.at(-1)).toEqual({
      role: "user",
      content: "[Note from user: steer]\n\nu2 volatile",
    });
  });
});

describe("shape — midConversationSystem gates the depth-0 system-injection delivery", () => {
  const sysInj = inChat({ role: "system", content: "GM note" });

  test("capable: the injection rides as a REAL trailing system row; the breakpoint still pins (offset counts it)", () => {
    const out = shape(soloInput({ injections: [sysInj], midConversationSystem: true }));
    expect(out.history.at(-1)).toEqual({ role: "system", content: "GM note" });
    expect(out.history.at(-2)).toEqual({ role: "user", content: "u2 volatile" });
    // The stable prefix is untouched (depth 0 lands after the volatile tail): squashed prefix 3 of 5 rows.
    expect(out.cacheBreakpointFromEnd).toBe(2);
  });

  test("not capable (default): byte-identical demote — the note folds into the adjacent user tail (regression pin)", () => {
    const out = shape(soloInput({ injections: [sysInj] }));
    expect(out.history.at(-1)?.role).toBe("user");
    expect(out.history.at(-1)?.content).toBe("u2 volatile\n\n[Note from system: GM note]");
  });

  test("capable + no user tail on an assistant-final canon: the CONTINUATION_NUDGE still lands (ends-on-user reads past system rows)", () => {
    const out = shape(soloInput({ appendUserTurn: null, injections: [sysInj], midConversationSystem: true }));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Continue the conversation.]" });
    expect(out.history.at(-2)).toEqual({ role: "system", content: "GM note" });
  });

  test("capable: the names pass never labels the system row (namesBehavior content)", () => {
    const out = shape(soloInput({ injections: [sysInj], midConversationSystem: true, namesBehavior: "content" }));
    expect(out.history.at(-1)).toEqual({ role: "system", content: "GM note" });
  });
});
