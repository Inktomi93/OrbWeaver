// SHAPE substrate: shape() + computeHistoryBreakpoint (the chat design doc Part II §2 SHAPE, §3, §8; Part III §12
// inv 1 + 7). The cross-repo byte-parity vs neo used to live in a sibling .parity.test — ripped out
// 2026-08-22 (#428, the neo floor is obsolete), so THIS is now the ONLY home; it pins the orbweaver-side
// invariants directly: the 3 breakpoint-undefined cases, the offset/clamp/floor math, the neo-quirk →
// undefined divergence, and the no-if(isGroup) solo-byte-identical contract.

import { proseOverridesSchema } from "@orb/contracts/prose";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { MessageRole } from "@orb/kit/message-role";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { ARIA, BEFORE_HISTORY_DEPTH, computeHistoryBreakpoint, inChat, KAI, pinnedRow, SOLO_CANON, shape, soloInput } from "./_shape-support.ts";

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

  // Owner ruling: a depth ≥ 2 injection moves the pin above itself instead of removing it. Here the note merges
  // into u1, so the pin is the greeting above that row.
  test("a depth≥2 in_chat injection pins the row above it instead of aborting", () => {
    const out = shape(soloInput({ injections: [inChat({ depth: 2, content: "deep" })] }));
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("greeting");
  });

  // #1462 — each abort carries the reason its own branch decided. An injection that lands on the very first
  // row (clamped to the top of a short history, not the anchored new-chat marker) leaves nothing to pin.
  test("an injection on the first row leaves no stable prefix, and says so", () => {
    expect(shape(soloInput({ injections: [inChat({ depth: 99, content: "top" })] })).breakpointDecision).toBe("in-prefix-injection-or-squash");
  });

  test("a placed breakpoint reports `placed`", () => {
    expect(shape(soloInput()).breakpointDecision).toBe("placed");
  });

  // D66-C (W6) — the prefix-stable fix supersedes the old ABORT #2 for this case. A depth-1 assistant
  // injection landing same-role against the last stable canon row is RE-FRAMED at the splice to a user
  // row in the neutral assistant-note frame (no speaker label), so it NEVER folds into the cached prefix. The stable prefix is
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
      { role: "user", content: "[Take the following into special consideration for your next message: cont]\n\nu2 volatile" },
    ]);
  });

  // Owner ruling: a cued round pins the last canon row before the cue, so the cue is the only volatile row.
  test("a group cue on a sent turn joins the volatile turn; the pin stays on the reply before it", () => {
    const out = shape(soloInput({ groupNudge: "[Write the next reply only as Aria.]" }));
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("a1 tip");
  });

  test("first turn (no stable prefix) → undefined", () => {
    const out = shape(soloInput({ canon: [], appendUserTurn: "first" }));
    expect(out.cacheBreakpointFromEnd).toBeUndefined();
    expect(out.breakpointDecision).toBe("no-stable-prefix");
  });

  test("narrator force round (ends on assistant → CONTINUATION_NUDGE) → the last reply is pinned + a user tail", () => {
    const out = shape(
      soloInput({
        canon: SOLO_CANON,
        appendUserTurn: null,
        output: "narrator",
        cardScope: "merged",
      }),
    );
    // The canon is committed to its last row; the cue is the only volatile row.
    expect(pinnedRow(out)?.content).toBe("a1 tip");
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

describe("shape — egocentric scoped fold", () => {
  test("scoped per-speaker targeting Kai folds Aria's turns to user + collapses; the pin is Kai's own reply", () => {
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
    // The fold is a pure function of (canon, target), and a scoped turn's system block is already per target,
    // so the folded prefix repeats byte for byte on Kai's next turn: the pin is Kai's own reply.
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("Kai replies");
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

  test('"completion" under a MERGING strategy: the rows merge and each speaker is inlined', () => {
    // This test previously asserted the opposite — that distinct authors stay UNMERGED so each keeps its own
    // wire `name`. That shape is invalid on the default floor: `roleHandlingFloor` unset clamps to `strict`,
    // and a strict provider (Anthropic hard-errors) rejects the adjacent same-role pair it produced. It also
    // breaks the MULTI-HUMAN room — two people speaking back-to-back are adjacent `user` rows with distinct
    // names, so they could never merge either. Preserving the label INSIDE the merged content satisfies both
    // requirements at once; the out-of-band field is still used on a non-merging floor (see merge-matrix P5).
    const out = shape(soloInput({ canon: groupCanon, appendUserTurn: null, namesBehavior: "completion" }));
    const asst = out.history.filter((r) => r.role === "assistant");
    expect(asst).toHaveLength(1);
    expect(asst[0]?.content).toBe("Aria: I think we should go north.\n\nKai: No, south is safer.");
    expect(asst[0]?.name).toBeUndefined();
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
  const stable = (role: MessageRole): { role: MessageRole; stable: true } => ({ role, stable: true });
  const volatile = (role: MessageRole): { role: MessageRole; stable: false } => ({ role, stable: false });

  test("clean history: the reply before the volatile turn is depth 1", () => {
    expect(computeHistoryBreakpoint([stable("assistant"), stable("user"), stable("assistant"), volatile("user")], true)).toEqual({
      offsetFromEnd: 1,
      decision: "placed",
    });
  });

  test("no committed row before the volatile turn → no-stable-prefix", () => {
    expect(computeHistoryBreakpoint([volatile("user")], false)).toEqual({ offsetFromEnd: undefined, decision: "no-stable-prefix" });
  });

  test("a volatile first row leaves nothing to pin → in-prefix-injection-or-squash", () => {
    expect(computeHistoryBreakpoint([volatile("user"), stable("assistant"), volatile("user")], true)).toEqual({
      offsetFromEnd: undefined,
      decision: "in-prefix-injection-or-squash",
    });
  });

  // The runner resolves a depth to the NEWEST row of that role group, so a stable row that shares its group with a
  // volatile row (two user rows under `none`) is not addressable; the pin walks back to the group above.
  test("a stable row whose role group runs into a volatile row walks the pin back one group", () => {
    const rows = [stable("assistant"), stable("user"), volatile("user")];
    expect(computeHistoryBreakpoint(rows, true)).toEqual({ offsetFromEnd: 1, decision: "placed" });
  });

  // A system row is transparent to the depth on both sides: the pin above a trailing system run, and the pin
  // across a kept mid-array note, count only user/assistant groups.
  test("system rows consume no depth", () => {
    expect(computeHistoryBreakpoint([stable("assistant"), stable("user"), stable("assistant"), volatile("user"), volatile("system")], true)).toEqual({
      offsetFromEnd: 1,
      decision: "placed",
    });
    expect(computeHistoryBreakpoint([stable("assistant"), stable("user"), volatile("system"), stable("assistant"), volatile("user")], true)).toEqual({
      offsetFromEnd: 2,
      decision: "placed",
    });
  });

  // A turn-scoped cue after a committed user row is the only new row: the newest group is stable, so depth 0 pins it.
  test("a stable newest group followed only by system rows is pinned at depth 0", () => {
    expect(computeHistoryBreakpoint([stable("assistant"), stable("user"), volatile("system")], true)).toEqual({ offsetFromEnd: 0, decision: "placed" });
  });
});

// ── A system row's slot is judged on the rows the wire delivers ─────────────────────────────────────────
describe("shape — a neighbour that converts to nothing is not a neighbour", () => {
  const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
  const canon = [
    { role: "assistant" as const, content: "You stand at the gate.", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "I look around.", authorName: "User" },
    { role: "assistant" as const, content: choicesOnly, authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "I flee.", authorName: "User" },
  ];
  const slotted = { midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted" as const };
  const note = inChat({ role: "system", depth: 2, content: "Author's note: keep it tense." });

  test("a note before a choices-only reply folds, because the wire would deliver it before a user row", () => {
    const out = shape(soloInput({ canon, appendUserTurn: null, injections: [note], ...slotted }));
    expect(out.history.filter((row) => row.role === "system")).toEqual([]);
    expect(out.stages.delivered.find((row) => row.folded !== undefined)?.folded).toBe("slot");
  });

  test("the same note before a reply with prose stays a system row (the control)", () => {
    const prose = canon.map((row) => (row.content === choicesOnly ? { ...row, content: "She waits." } : row));
    const out = shape(soloInput({ canon: prose, appendUserTurn: null, injections: [note], ...slotted }));
    expect(out.history.map((row) => row.role)).toEqual(["assistant", "user", "system", "assistant", "user"]);
  });
});

// ── The cache pair pins ABOVE the deepest in_chat injection (owner ruling) ───────────────────────────────
// A depth ≥ 2 injection used to remove every history breakpoint, so the whole history was billed each turn
// while an author's note or a depth-N world-info entry was active (SHAPING-MATRIX §8 defect 2). The pin now sits
// on the last stable row above it, counted in role groups exactly as the runner counts them.
describe("shape — the history pin sits above the deepest injection", () => {
  const canon = [
    { role: "assistant" as const, content: "g", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "u1", authorName: "User" },
    { role: "assistant" as const, content: "a1", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "u2", authorName: "User" },
    { role: "assistant" as const, content: "a2", authorName: "Aria", characterId: ARIA },
  ];
  const note = inChat({ role: "system", depth: 4, content: "NOTE" });
  const slotted = { midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted" as const };

  test("a depth-4 note kept as a system row pins the user row above it", () => {
    const out = shape(soloInput({ canon, appendUserTurn: "u3", injections: [note], ...slotted }));
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("u1");
  });

  test("a depth-4 note folded into the row below it pins the row above that one", () => {
    const out = shape(soloInput({ canon, appendUserTurn: "u3", injections: [note] }));
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("g");
  });

  test("the note moves with the history, and the next turn repeats this turn's pinned prefix byte for byte", () => {
    const first = shape(soloInput({ canon, appendUserTurn: "u3", injections: [note], ...slotted }));
    const grown = [
      ...canon,
      { role: "user" as const, content: "u3", authorName: "User" },
      { role: "assistant" as const, content: "a3", authorName: "Aria", characterId: ARIA },
    ];
    const second = shape(soloInput({ canon: grown, appendUserTurn: "u4", injections: [note], ...slotted }));
    const pin = rowIndexAtCacheDepth(first.history, first.cacheBreakpointFromEnd ?? -1) ?? -1;
    expect(pin).toBeGreaterThanOrEqual(0);
    expect(second.history.slice(0, pin + 1)).toEqual(first.history.slice(0, pin + 1));
    expect(rowIndexAtCacheDepth(second.history, second.cacheBreakpointFromEnd ?? -1)).toBeGreaterThan(pin);
  });

  test("the new-chat marker above the first row never blocks the pin", () => {
    const marker = inChat({ depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" });
    const out = shape(soloInput({ injections: [marker] }));
    expect(out.history[0]?.content).toBe("[Start a new chat]");
    expect(pinnedRow(out)?.content).toBe("a1 tip");
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

  // Owner ruling 2026-08-07: the cue is a PRESET-homed PROSE-1 slot, not a `const` in shape.ts. Parsed from
  // an untyped literal so this compiles against the pre-ruling source too — there the schema strips the
  // unknown key, the hardcoded sentence ships, and the assertion fails for the reason it exists to catch.
  test("the continuation cue is host-authorable: a preset override replaces the shipped sentence", () => {
    const prose = proseOverridesSchema.parse({ "chat.assembly.continuationNudge": { text: "[Your move.]", baseVersion: 1 } });
    const out = shape(soloInput({ canon: SOLO_CANON, appendUserTurn: null, prose }));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Your move.]" });
  });

  test("an absent cue override delivers the shipped sentence, byte-identical", () => {
    const out = shape(soloInput({ canon: SOLO_CANON, appendUserTurn: null, prose: {} }));
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
      content: "[Take the following into special consideration for your next message: The night was]\n\nu2 volatile",
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
    // No merge: the two adjacent assistant rows remain separate. Two characters run names "none" as
    // "default" (owner ruling), so each row keeps its speaker label.
    expect(out.history.filter((r) => r.role === "assistant")).toEqual([
      { role: "assistant", content: "Aria: First." },
      { role: "assistant", content: "Kai: Second." },
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
    expect(out.history.filter((r) => r.role === "assistant")).toEqual([{ role: "assistant", content: "Aria: First.\n\nKai: Second." }]);
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
      content: "[Take the following into special consideration for your next message: steer]\n\nu2 volatile",
    });
  });
});

describe("shape — midConversationSystem gates the depth-0 system-injection delivery", () => {
  const sysInj = inChat({ role: "system", content: "GM note" });

  test("capable: the injection rides as a REAL trailing system row; the breakpoint still pins (offset counts it)", () => {
    const out = shape(soloInput({ injections: [sysInj], midConversationSystem: true, roleHandlingFloor: "slotted" }));
    expect(out.history.at(-1)).toEqual({ role: "system", content: "GM note" });
    expect(out.history.at(-2)).toEqual({ role: "user", content: "u2 volatile" });
    // The depth counts role groups and a system row is transparent, so the pin is the reply before the turn.
    expect(out.cacheBreakpointFromEnd).toBe(1);
    expect(pinnedRow(out)?.content).toBe("a1 tip");
  });

  test("not capable (default): the note folds bare into the adjacent user tail, after its text", () => {
    const out = shape(soloInput({ injections: [sysInj] }));
    expect(out.history.at(-1)?.role).toBe("user");
    expect(out.history.at(-1)?.content).toBe("u2 volatile\n\nGM note");
  });

  // The direct Anthropic wire refuses `[…assistant, system, user]`: SHAPE's own cue goes BEFORE the kept system
  // row, so the row follows a user row and ends the array.
  test("capable + an assistant-final canon: the continuation cue lands BEFORE the kept system row", () => {
    const out = shape(soloInput({ appendUserTurn: null, injections: [sysInj], midConversationSystem: true, roleHandlingFloor: "slotted" }));
    expect(out.history.at(-2)).toEqual({ role: "user", content: "[Continue the conversation.]" });
    expect(out.history.at(-1)).toEqual({ role: "system", content: "GM note" });
  });

  test("capable: the names pass never labels the system row (namesBehavior content)", () => {
    const out = shape(soloInput({ injections: [sysInj], midConversationSystem: true, roleHandlingFloor: "slotted", namesBehavior: "content" }));
    expect(out.history.at(-1)).toEqual({ role: "system", content: "GM note" });
  });
});
