// SHAPE substrate: shape() + computeHistoryBreakpoint (the chat design doc Part II §2 SHAPE, §3, §8; Part III §12
// inv 1 + 7). The cross-repo byte-parity vs neo used to live in a sibling .parity.test — ripped out
// 2026-08-22 (#428, the neo floor is obsolete), so THIS is now the ONLY home; it pins the orbweaver-side
// invariants directly: the 3 breakpoint-undefined cases, the offset/clamp/floor math, the neo-quirk →
// undefined divergence, and the no-if(isGroup) solo-byte-identical contract.
import type { AssembleContext, ChatInjection, MessageView } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/inference";
import { ROLE_HANDLING, SYSTEM_ROW_PLACEMENT } from "@orb/contracts/inference";
import type { NamesBehavior } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { proseOverridesSchema } from "@orb/contracts/prose";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { CharacterId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { describe } from "vitest";
import { BEFORE_HISTORY_DEPTH } from "../../../../../packages/server/src/domain/chat/assembly/injections.ts";
import { computeHistoryBreakpoint, shape, toShapeCanon } from "../../../../../packages/server/src/domain/chat/assembly/shape.ts";
import type { HistoryMacroNames } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ARIA = castId<CharacterId>("character_aria");
const KAI = castId<CharacterId>("character_kai");
/** The room's SYNTHETIC group card — a real `characters` row named "Group" that narrator turns are authored
 *  by (`__group__<chatId>`). It resolves through the identity producer like any member, which is exactly why
 *  every "is this a narrator row?" inference used to succeed at naming the wrong thing. */
const GROUP_ID = castId<CharacterId>("character_group");
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

/** The delivered row the runner pins for SHAPE's depth — resolved with the runner's own depth counter. */
function pinnedRow(out: ReturnType<typeof shape>): { role: string; content: string } | undefined {
  const index = rowIndexAtCacheDepth(out.history, out.cacheBreakpointFromEnd ?? -1);
  return index === undefined ? undefined : out.history[index];
}

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
    { role: "user" as const, content: "What do you two think?", authorName: "Nate" },
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
          { role: "user" as const, content: "u1", authorName: "Nate" },
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
      { role: "user" as const, content: "u1", authorName: "Nate" },
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
      { role: "user" as const, content: "u1", authorName: "Nate" },
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

  test("not capable (default): byte-identical demote — the note folds into the adjacent user tail (regression pin)", () => {
    const out = shape(soloInput({ injections: [sysInj] }));
    expect(out.history.at(-1)?.role).toBe("user");
    expect(out.history.at(-1)?.content).toBe("u2 volatile\n\n[Take the following into special consideration: GM note]");
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

// ── MID-HISTORY SYSTEM INJECTIONS (the depth>0 arm of `turns.historySystemRows`) ─────────────────────
// The DEFECT this pins: an author's note (`origin:"authors-note"`, role system, ST's default depth 4) and a
// depth-N world-info entry are the real producers of a MID-CONVERSATION system row, and both demoted to
// `[Take the following into special consideration: …]` user rows on EVERY wire — including one measured to carry mid-array system rows —
// because the splice hard-coded "depth > 0 always demotes". `historySystemRows` is the measured fact that
// answers exactly this question (mid-array, not the tail channel), so it gates this arm too; the tail arm
// stays on `midConversationSystem` (D69: one fact per question, never inferred from its sibling).
describe("shape — historySystemRows also gates a DEPTH>0 system injection (author's note / WI depth entry)", () => {
  const deepSys = inChat({ depth: 2, role: "system", content: "GM note" });

  test("measured wire: the note rides as a REAL system row at its depth, un-framed and un-merged", () => {
    const out = shape(soloInput({ injections: [deepSys], historySystemRows: true, roleHandlingFloor: "slotted" }));
    const row = out.history.find((r) => r.role === "system");
    expect(row?.content).toBe("GM note");
    // Depth 2 = two positions back from the tail (canon: greeting, u1, a1 tip, +u2 volatile).
    expect(out.history.map((r) => r.role)).toEqual(["assistant", "user", "system", "assistant", "user"]);
    // No `[Note from …]` frame anywhere: the operator channel carries it as itself.
    expect(out.history.some((r) => r.content.includes("[Note from"))).toBe(false);
  });

  test("unmeasured wire (the default): byte-identical demote — the pre-capability behavior (regression pin)", () => {
    const off = shape(soloInput({ injections: [deepSys], historySystemRows: false }));
    const unset = shape(soloInput({ injections: [deepSys] }));
    expect(unset.history).toEqual(off.history);
    expect(unset.history.some((r) => r.role === "system")).toBe(false);
    expect(unset.history.some((r) => r.content.includes("[Take the following into special consideration: GM note]"))).toBe(true);
  });

  test("the TAIL arm is still its own bit: midConversationSystem alone does NOT promote a depth>0 row (D69)", () => {
    const out = shape(soloInput({ injections: [deepSys], midConversationSystem: true, roleHandlingFloor: "slotted" }));
    expect(out.history.some((r) => r.role === "system")).toBe(false);
    expect(out.stages.delivered.find((row) => row.folded !== undefined)?.folded).toBe("mid-array");
  });

  test("a mid-history system row is never speaker-labelled, on any names mode", () => {
    for (const namesBehavior of ["content", "completion", "default"] as const) {
      const out = shape(soloInput({ injections: [deepSys], historySystemRows: true, roleHandlingFloor: "slotted", namesBehavior }));
      const row = out.history.find((r) => r.role === "system");
      expect(row?.content).toBe("GM note");
      expect(row?.name).toBeUndefined();
    }
  });
});

// ── INJECT-NAMED-AS-PLAYER — the end-to-end pin ───────────────────────────────────────────────────
// The reported live wire (chat_01kz6qesv6fk6bq1gmr8kc0wcf, OpenRouter/Sonnet — no mid-conversation
// system): the rpg instruction channel arrived as `Nate: [Take the following into special consideration: # Game state …]`, i.e. the
// game state, card teach and steering license delivered as if the PLAYER had written them. Measured then:
// final user message 3,037 chars, 2× `Nate:` labels.
//
// `namesBehavior: "content"` is the mode that always prefixes, so it is the sharpest probe: under it the
// player's own turn MUST be labelled and the injected instruction MUST NOT be.
describe("INJECT-NAMED-AS-PLAYER — a demoted system injection is never labelled as a participant", () => {
  const gameState = "# Game state\nTrackers: HP (physical health)";

  test('namesBehavior "content": the demoted note carries NO speaker label, the player\'s turn still does', () => {
    const out = shape(
      soloInput({
        namesBehavior: "content",
        injections: [inChat({ depth: 0, role: "system", content: gameState })],
      }),
    );
    const tail = out.history.at(-1);
    // The note demoted onto the user tail (the wire requires it — this backend takes no mid-conversation
    // system) and merged with the player's turn, which is the correct and cache-stable shape …
    expect(tail?.role).toBe("user");
    expect(tail?.content).toContain(gameState);
    // … but the instruction is NOT stamped with the player's name. This is the whole defect: exactly ONE
    // speaker label in the turn — the player's own words — never a second one introducing the game rules.
    // (Live, with the real speaker name, this read `Nate:` TWICE in one 3,037-char user message.)
    const labels = tail?.content.match(new RegExp(`${SPEAKERS.user}:`, "gu")) ?? [];
    expect(labels).toHaveLength(1);
    // And the label that IS present belongs to the player's text, not to the note.
    expect(tail?.content).toContain(`${SPEAKERS.user}: u2 volatile`);
    expect(tail?.content).not.toMatch(new RegExp(`${SPEAKERS.user}:\\s*\\[Take the following into special consideration`, "u"));
  });

  test("the marker is INTERNAL — no wire row leaks a `speakerless` field", () => {
    const out = shape(soloInput({ namesBehavior: "content", injections: [inChat({ depth: 0, role: "system", content: gameState })] }));
    // It answers "may this row be labelled?" inside the pipeline and is consumed at the names pass; a
    // backend must never receive an internal assembly flag.
    for (const row of out.history) {
      expect(row).not.toHaveProperty("speakerless");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE ROLE-HANDLING × NAMES-BEHAVIOR MATRIX + the cache-stability properties that ride on it.
//
// The tests ABOVE are point samples: a handful of (strategy, mode) pairs somebody had a reason to check.
// Two real defects found 2026-08-04 both lived in cells nobody sampled — INJECT-NAMED-AS-PLAYER (a demoted
// system injection wearing the PLAYER's name) and the strict/`completion` merge (an out-of-band `name`
// field blocking a merge a strict provider requires). So this walks the whole grid and asserts the
// properties that must hold in EVERY cell. A red cell here is a bug list entry, measured not argued.
//
//   P1 MERGE       — when the strategy merges, NO two adjacent rows share a role. Wire validity, not taste:
//                    strict backends reject the adjacent pair outright.
//   P2 ATTRIBUTION — an injection's bytes never carry a speaker. The wire role it was forced into says
//                    nothing about authorship.
//   P3 PREFIX      — cached prefix bytes are identical with and without an active depth-0 injection.
//   P4 GROWTH      — turn N's cached prefix is a literal prefix of turn N+1's history. THIS is what prompt
//                    caching depends on across a conversation, and nothing asserted it before.
//   P5 MULTI-HUMAN — two people speaking back-to-back merge AND stay individually attributable.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const ROLE_HANDLINGS: readonly RoleHandling[] = ["none", "merge", "semi-strict", "strict"];
const NAMES_BEHAVIORS: readonly NamesBehavior[] = ["none", "default", "content", "completion"];

/** A SOLO canon — the common case, and the one the live INJECT-NAMED-AS-PLAYER capture came from. */
const MATRIX_SOLO_CANON = [
  { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
  { role: "user" as const, content: "u1", authorName: "User" },
  { role: "assistant" as const, content: "a1 tip", authorName: "Aria", characterId: ARIA },
];

/** A GROUP canon with ADJACENT distinct-character assistant rows — the shape that makes the `completion`
 *  out-of-band `name` field collide with the merge requirement. Not an edge case: a multi-speaker round
 *  commits N adjacent assistant rows under one user turn by construction. */
const GROUP_CANON = [
  { role: "user" as const, content: "u1", authorName: "User" },
  { role: "assistant" as const, content: "I think we should go north.", authorName: "Aria", characterId: ARIA },
  { role: "assistant" as const, content: "No, south is safer.", authorName: "Kai", characterId: KAI },
];

/** The rpg instruction channel, in its real shape: a depth-0 `role:"system"` injection. On a backend
 *  without mid-conversation system this demotes to `user` and rides the tail — the exact live path. */
const INSTRUCTION: ChatInjection = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "# Game state\nTrackers: HP",
};

/** The SAME instruction authored `role:"user"` — a host's post-history teach / author's note. It is the
 *  identical instruction wearing a different WIRE LANE, and it must be attributed identically.
 *
 *  This arm exists because a fix that carved out `role:"user"` injections shipped and reintroduced the
 *  reported bug for exactly this shape: the final turn arrived with TWO speaker labels, the second one
 *  attributing the game rules to the player. The system-role arm alone could never have caught it. */
const INSTRUCTION_AS_USER: ChatInjection = { ...INSTRUCTION, role: "user" };

/** The marker that identifies the injection's bytes wherever they land (merged or standalone). */
const INSTRUCTION_MARK = "# Game state";

interface Cell {
  readonly canon: typeof MATRIX_SOLO_CANON;
  readonly roleHandling: RoleHandling;
  readonly namesBehavior: NamesBehavior;
  readonly injections: readonly ChatInjection[];
  readonly appendUserTurn?: string | null;
}

function shapeCell(cell: Cell): ReturnType<typeof shape> {
  // Default applies to `undefined` ONLY — `appendUserTurn: null` is meaningful (no volatile tail), so a
  // `??` here would silently erase the case this matrix most wants to cover.
  const { appendUserTurn = "u2 volatile" } = cell;
  return shape({
    canon: cell.canon,
    appendUserTurn,
    injections: [...cell.injections],
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: cell.namesBehavior,
    speakers: SPEAKERS,
    groupNudge: null,
    roleHandling: cell.roleHandling,
    // Left at the default floor deliberately — `roleHandlingFloor` unset means `strict`, and the clamp
    // takes max(floor, knob), so the KNOB alone cannot go looser than strict. That is the shipped
    // behaviour and the matrix must measure it, not a hypothetical.
  });
}

/** Adjacent same-role pairs in the delivered history — the wire-validity violation, listed for the message. */
function adjacentSameRole(history: readonly { role: string; content: string }[]): string[] {
  const bad: string[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (prev !== undefined && cur !== undefined && prev.role === cur.role) {
      bad.push(`[${i - 1},${i}] both "${cur.role}"`);
    }
  }
  return bad;
}

/** Does any speaker label appear attached to the INSTRUCTION's bytes? Checks the row carrying the
 *  instruction for a `Name:` label introducing it — the INJECT-NAMED-AS-PLAYER shape. */
function instructionCarriesSpeaker(history: readonly { role: string; content: string; name?: string }[]): string | null {
  const row = history.find((r) => r.content.includes(INSTRUCTION_MARK));
  if (row === undefined) {
    return null;
  }
  // The label may introduce the whole merged row, or sit immediately before the instruction bytes after a
  // merge separator. Both are misattribution: the model reads a speaker as the author of what follows.
  for (const speaker of [SPEAKERS.user, SPEAKERS.assistant]) {
    if (new RegExp(`${speaker}:\\s*(\\[Note from|${INSTRUCTION_MARK})`, "u").test(row.content)) {
      return `"${speaker}:" introduces the instruction bytes`;
    }
  }
  if (row.name !== undefined) {
    return `row carries an out-of-band name field "${row.name}"`;
  }
  return null;
}

// ── P1 + P2 — the per-cell invariants ─────────────────────────────────────────────────────────────

describe("the roleHandling × namesBehavior matrix", () => {
  for (const canonName of ["solo", "group"] as const) {
    const canon = canonName === "solo" ? MATRIX_SOLO_CANON : GROUP_CANON;
    for (const roleHandling of ROLE_HANDLINGS) {
      for (const namesBehavior of NAMES_BEHAVIORS) {
        for (const [injLabel, injection] of [
          ["system-injection", INSTRUCTION],
          ["user-injection", INSTRUCTION_AS_USER],
        ] as const) {
          const label = `${canonName} · roleHandling=${roleHandling} · names=${namesBehavior} · ${injLabel}`;

          test(`P1 MERGE — ${label}: no adjacent same-role rows survive`, () => {
            const out = shapeCell({ canon, roleHandling, namesBehavior, injections: [injection] });
            // The clamp floors to `strict` when no model floor is supplied, so EVERY cell here merges —
            // including the `none` knob, which cannot go looser than the floor. If that ever changes, this
            // assertion is the thing that should be revisited, not silently relaxed.
            expect(adjacentSameRole(out.history), `adjacent same-role rows on the wire: ${adjacentSameRole(out.history).join(" · ")}`).toEqual([]);
          });

          test(`P2 ATTRIBUTION — ${label}: the injection carries no speaker`, () => {
            const out = shapeCell({ canon, roleHandling, namesBehavior, injections: [injection] });
            expect(instructionCarriesSpeaker(out.history)).toBeNull();
          });
        }
      }
    }
  }
});

// ── P3 — a depth-0 injection must not move cached bytes ───────────────────────────────────────────

describe("P3 PREFIX — a depth-0 injection rides the volatile tail and never moves the cached prefix", () => {
  for (const roleHandling of ROLE_HANDLINGS) {
    for (const namesBehavior of NAMES_BEHAVIORS) {
      test(`roleHandling=${roleHandling} · names=${namesBehavior}`, () => {
        const withNote = shapeCell({ canon: MATRIX_SOLO_CANON, roleHandling, namesBehavior, injections: [INSTRUCTION] });
        const clean = shapeCell({ canon: MATRIX_SOLO_CANON, roleHandling, namesBehavior, injections: [] });
        const cut = clean.cacheBreakpointFromEnd;
        // One unconditional assertion on a computed verdict, rather than branching around `expect`: a cell
        // that claims NO breakpoint is caching nothing and has nothing to protect, but it still has to show
        // up in the run so a cell that silently STOPS claiming one is visible.
        const prefixOf = (o: typeof clean): string =>
          cut === undefined ? "" : JSON.stringify(o.history.slice(0, o.history.length - cut).map((r) => [r.role, r.content]));
        const moved = cut !== undefined && prefixOf(withNote) !== prefixOf(clean);
        const verdict = moved ? "PREFIX MOVED" : "ok";
        expect(verdict).toBe("ok");
      });
    }
  }
});

// ── P4 — the property prompt caching depends on ACROSS a conversation ─────────────────────────────

describe("P4 GROWTH — turn N's cached prefix is a literal prefix of turn N+1's history", () => {
  // Turn N+1's canon = turn N's canon + the committed exchange (the user turn that WAS volatile, plus the
  // reply it produced). That is exactly how a chat grows, and the cache claim is that everything the
  // provider already ingested stays byte-identical underneath it.
  const turnN = MATRIX_SOLO_CANON;
  const turnNPlus1 = [
    ...MATRIX_SOLO_CANON,
    { role: "user" as const, content: "u2 volatile", authorName: "User" },
    { role: "assistant" as const, content: "a2 reply", authorName: "Aria", characterId: ARIA },
  ];

  for (const namesBehavior of NAMES_BEHAVIORS) {
    test(`names=${namesBehavior}: the previously-cached rows are unchanged one turn later`, () => {
      const n = shapeCell({ canon: turnN, roleHandling: "strict", namesBehavior, injections: [INSTRUCTION] });
      const n1 = shapeCell({ canon: turnNPlus1, roleHandling: "strict", namesBehavior, injections: [INSTRUCTION], appendUserTurn: "u3 volatile" });
      const cut = n.cacheBreakpointFromEnd;
      const cachedAtN = cut === undefined ? [] : n.history.slice(0, n.history.length - cut).map((r) => [r.role, r.content]);
      const sameRowsAtN1 = n1.history.slice(0, cachedAtN.length).map((r) => [r.role, r.content]);
      // If this fails, every turn re-bills the whole story prefix — the failure is SILENT in production
      // (nothing errors; the bill just goes up), which is why it needs a test rather than observation.
      // A cell with no breakpoint compares [] to [] and passes vacuously: it caches nothing to begin with.
      expect(sameRowsAtN1).toEqual(cachedAtN);
    });
  }
});

// ── P5 — MULTI-HUMAN adjacency (owner-raised, 2026-08-04) ─────────────────────────────────────────
// Two humans in one room send back-to-back: that is two adjacent `user` rows carrying DIFFERENT author
// names. Both requirements apply at once and they pull against each other under the old shape:
//   • the rows MUST merge (a strict backend rejects the adjacent same-role pair), and
//   • each speaker's label MUST survive the merge (otherwise the model cannot tell who said what, and
//     attributes both messages to whoever spoke first).
// An out-of-band `name` field can satisfy neither together — `squashSameRole` refuses to merge two rows
// with distinct names, which is exactly why `completion` had to start inlining. This is the multi-human
// case the room actually ships, not a synthetic one.

describe("P5 MULTI-HUMAN — two people speaking back-to-back", () => {
  const twoHumans = [
    { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "I open the door.", authorName: "Nate" },
    { role: "user" as const, content: "I follow him in.", authorName: "Joe" },
  ];

  for (const namesBehavior of NAMES_BEHAVIORS) {
    test(`names=${namesBehavior}: the two human turns merge into ONE user row`, () => {
      const out = shapeCell({ canon: twoHumans, roleHandling: "strict", namesBehavior, injections: [] });
      expect(adjacentSameRole(out.history)).toEqual([]);
    });
  }

  test("both speakers stay attributable inside the merged row (content mode)", () => {
    const out = shapeCell({ canon: twoHumans, roleHandling: "strict", namesBehavior: "content", injections: [] });
    const merged = out.history.find((r) => r.content.includes("I open the door."));
    expect(merged?.content).toContain("Nate: I open the door.");
    expect(merged?.content).toContain("Joe: I follow him in.");
  });

  test("completion mode ALSO keeps both speakers — the out-of-band name cannot survive a merge", () => {
    // Before the inlining change this produced two unmerged rows with `name: "Nate"` / `name: "Joe"`, which a
    // strict provider rejects outright. Merging while DROPPING one name would be worse than the rejection:
    // the room would silently tell the model that Nate said Joe's line.
    const out = shapeCell({ canon: twoHumans, roleHandling: "strict", namesBehavior: "completion", injections: [] });
    const merged = out.history.find((r) => r.content.includes("I open the door."));
    expect(merged?.content).toContain("Nate: I open the door.");
    expect(merged?.content).toContain("Joe: I follow him in.");
    expect(merged?.name).toBeUndefined();
  });

  test("under a NON-merging strategy completion keeps the out-of-band name (the field still has a use)", () => {
    // `roleHandling` cannot go looser than the model floor, so this is reached by an explicit non-strict
    // FLOOR — a backend that tolerates adjacent same-role rows. There the OpenAI-spec `name` field is the
    // better shape (no bytes injected into content) and it is preserved.
    const out = shape({
      canon: twoHumans,
      appendUserTurn: null,
      injections: [],
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: "completion",
      speakers: SPEAKERS,
      groupNudge: null,
      roleHandling: "none",
      roleHandlingFloor: "none",
    });
    const rows = out.history.filter((r) => r.role === "user");
    expect(rows.map((r) => r.name)).toEqual(["Nate", "Joe"]);
    expect(rows.map((r) => r.content)).toEqual(["I open the door.", "I follow him in."]);
  });
});

// INVITE-JOIN-NULL-PERSONA, the PROMPT half. An invite-joined member seated with `activePersonaId = NULL`
// stamps `persona_id = NULL` on every row he writes; `toShapeCanon` returned `authorName: null` for those,
// and `applyNamesBehavior` then falls back to `speakers.user` — this turn's `{{user}}`, which belongs to ONE
// human. So the model was told the HOST said everything the member said. These rows are LEGACY (the migration
// posture accepts them), so the guard has to hold at read time, not just at the seat.
describe("toShapeCanon — the null-persona-stamp guard (a row never borrows a stranger's name)", () => {
  const hostUser = castId<UserId>("user_host");
  const memberUser = castId<UserId>("user_member");
  const hostPersona = castId<PersonaId>("persona_host");

  const macroNames: HistoryMacroNames = {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>([[hostPersona, { name: "Nate", description: "" }]]),
  };

  let nextSeq = 0;
  const userRow = (authorUserId: UserId, personaId: PersonaId | null, content: string): MessageView => {
    nextSeq += 1;
    // @orb-waive no-test-fabrication(unknown): slim MessageView double — toShapeCanon reads only role/kind/content/seq/personaId/authorUserId/excludedFromPrompt/id, all real here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    return {
      id: castId<MessageId>(`message_null_stamp_${nextSeq}`),
      seq: nextSeq,
      role: "user",
      // A real row always declares one (NOT NULL, default `standard`) — the double must not omit a column the
      // prompt-policy dispatch reads, or it tests a shape the read seam cannot produce.
      kind: "standard",
      content,
      authorUserId,
      characterId: null,
      personaId,
      excludedFromPrompt: false,
    } as unknown as MessageView;
  };

  /** A ctx just rich enough for `toShapeCanon`'s macro render — the host is the live trigger. */
  const ctxFor = (triggerUserId: UserId | null): AssembleContext =>
    // @orb-waive no-test-fabrication(unknown): slim AssembleContext double — this call path reads only character/characters/characterIds/recentMessages/promptConfig/triggerUserId. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      character: { name: "Aria", description: "" },
      characters: [],
      characterIds: [],
      recentMessages: [],
      promptConfig: DEFAULT_PROMPT_CONFIG,
      triggerUserId,
    }) as unknown as AssembleContext;

  test("a member's NULL-stamped row does NOT inherit the host's persona — it takes the unresolvable floor", () => {
    const canon = [userRow(hostUser, hostPersona, "host line"), userRow(memberUser, null, "member line")];
    const rows = toShapeCanon(canon, ctxFor(hostUser), macroNames, null);
    expect(rows.map((r) => r.authorName)).toEqual(["Nate", DEFAULT_PERSONA_NAME]);
  });

  test("end-to-end on the wire: exactly ONE line is spoken as the host", () => {
    const canon = [userRow(hostUser, hostPersona, "host line"), userRow(memberUser, null, "member line")];
    const out = shape({
      canon: toShapeCanon(canon, ctxFor(hostUser), macroNames, null),
      appendUserTurn: null,
      injections: [],
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: "content",
      speakers: { user: "Nate", assistant: "Aria" },
      groupNudge: null,
      roleHandling: "none",
      roleHandlingFloor: "none",
    });
    const userLines = out.history.filter((r) => r.role === "user").map((r) => r.content);
    expect(userLines).toEqual(["Nate: host line", `${DEFAULT_PERSONA_NAME}: member line`]);
    expect(userLines.filter((l) => l.startsWith("Nate: "))).toHaveLength(1);
  });

  test("the TRIGGER's own unstamped row still borrows this turn's {{user}} (byte-identical solo behavior)", () => {
    const rows = toShapeCanon([userRow(hostUser, null, "host line")], ctxFor(hostUser), macroNames, null);
    expect(rows[0]?.authorName).toBeNull();
  });

  test("an UNKNOWN trigger (drain / auto / preview / any hand-built ctx) fails CLOSED — nobody borrows", () => {
    const rows = toShapeCanon([userRow(hostUser, null, "host line")], ctxFor(null), macroNames, null);
    expect(rows[0]?.authorName).toBe(DEFAULT_PERSONA_NAME);
  });
});

// ── The DELIVERED-ROW TRACE (`stages.delivered` → `ShapeTrace.rows`) ────────────────────────────────────
//
// RPG-NO-PROMPT-DEBUG: the shape trace projected stage COUNTS only, so block order/role/voice was
// reconstructed by hand from wire captures. These pin the projection itself — and specifically that a squash
// which folds an assembled row into a canon turn reports `merged` rather than inheriting `canon`, which is the
// only way the INJECT-NAMED-AS-PLAYER shape is visible on a debug surface.

const MSG_GREETING = castId<MessageId>("message_greeting");
const MSG_U1 = castId<MessageId>("message_u1");
const MSG_TIP = castId<MessageId>("message_tip");

/** SOLO_CANON with the message ids a real `toShapeCanon` load stamps — the provenance discriminator. */
const STORED_CANON = [
  { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA, messageId: MSG_GREETING },
  { role: "user" as const, content: "u1", authorName: "Nate", messageId: MSG_U1 },
  { role: "assistant" as const, content: "a1 tip", authorName: "Aria", characterId: ARIA, messageId: MSG_TIP },
];

describe("shape — the delivered-row trace", () => {
  test("a clean send projects one row per delivered row, in order, with role + voice + size", () => {
    const out = shape(soloInput({ canon: STORED_CANON }));

    // The projection is index-aligned with the wire it describes — the invariant every reading of this
    // surface rests on (row 3 in the panel IS wire row 3).
    expect(out.stages.delivered).toHaveLength(out.history.length);
    expect(out.stages.delivered.map((row) => row.chars)).toEqual(out.history.map((row) => row.content.length));
    expect(out.stages.delivered.map((row) => row.role)).toEqual(out.history.map((row) => row.role));

    expect(out.stages.delivered).toEqual([
      { role: "assistant", name: "Aria", source: "canon", chars: "greeting".length },
      // `chars` is the DELIVERED length: names=default inlined "Nate: " into this row, and the readout must
      // report what rides the wire, not the stored body.
      { role: "user", name: "Nate", source: "canon", chars: "Nate: u1".length },
      { role: "assistant", name: "Aria", source: "canon", chars: "a1 tip".length },
      // The synthetic turn a regen/continue appends is stored nowhere — `assembled`, not `canon`.
      { role: "user", source: "assembled", chars: "u2 volatile".length },
    ]);
  });

  test("INJECT-NAMED-AS-PLAYER's tell: a demoted system note folded into the player's turn reports MERGED", () => {
    // The live shape from `docs/history/dogfood-tracking-2026-08-08.md`: a backend without mid-conversation system support demotes a
    // depth-0 system injection to a user note, and the same-role squash folds it into the player's own turn.
    // The delivered row is then ONE user row whose bytes are half the player's and half the game's — which a
    // stage count cannot show and which reporting the head's `canon` provenance would actively hide.
    const out = shape(
      soloInput({
        canon: STORED_CANON.slice(0, 2),
        appendUserTurn: null,
        injections: [inChat({ depth: 0, role: "system", content: "# Game state\nHP 24/30" })],
      }),
    );

    const last = out.stages.delivered.at(-1);
    expect(last?.role).toBe("user");
    expect(last?.source).toBe("merged");
    // …and it still wears the PLAYER's name, which is the defect this readout makes visible.
    expect(last?.name).toBe("Nate");
    // The wire agrees: one row, both bodies.
    expect(out.history.at(-1)?.content).toContain("u1");
    expect(out.history.at(-1)?.content).toContain("HP 24/30");
  });

  test("a capability-kept depth-0 system row stays its own UNNAMED row (no speaker to misattribute)", () => {
    const out = shape(
      soloInput({
        canon: STORED_CANON.slice(0, 2),
        appendUserTurn: null,
        midConversationSystem: true,
        roleHandlingFloor: "slotted",
        injections: [inChat({ depth: 0, role: "system", content: "operator channel" })],
      }),
    );

    const systemRow = out.stages.delivered.find((row) => row.role === "system");
    expect(systemRow).toEqual({ role: "system", source: "assembled", chars: "operator channel".length });
    // The player's turn is untouched beside it — no merge, so it stays plain canon.
    expect(out.stages.delivered.find((row) => row.role === "user")?.source).toBe("canon");
  });

  test("the continuation nudge is reported as assembled, never as the last canon turn", () => {
    // A canon ending on assistant gets `[Continue the conversation.]` appended; it is assembly's own row.
    const out = shape(soloInput({ canon: STORED_CANON, appendUserTurn: null }));

    expect(out.history.at(-1)?.content).toBe("[Continue the conversation.]");
    expect(out.stages.delivered.at(-1)).toEqual({ role: "user", source: "assembled", chars: "[Continue the conversation.]".length });
  });

  test("under a NON-merging strategy every delivered row keeps its own provenance (nothing collapses)", () => {
    const out = shape(
      soloInput({
        canon: STORED_CANON.slice(0, 2),
        appendUserTurn: null,
        roleHandling: "none",
        roleHandlingFloor: "none",
        injections: [inChat({ depth: 0, role: "user", content: "steer" })],
      }),
    );

    expect(out.stages.delivered.map((row) => row.source)).toEqual(["canon", "canon", "assembled"]);
  });
});

// ── THE ROW-PURPOSE DISPATCHES (D129 §G — the SHAPE half of the fan-out) ────────────────────────────────
//
// Each test here fails the moment a site goes back to inferring purpose from role × attribution × the room's
// dial. Before this landed: `MESSAGE_KIND_POLICY.comment.prompt === "never"` was enforced by nothing (a
// comment row shipped to the model), the `<speaker>` strip ran on EVERY assistant row on the theory that
// tag-absence is the same claim as "not narrator", and the name-stamp put ONE identity's label on a
// multi-speaker narrator block.

const KIND_CTX: AssembleContext =
  // @orb-waive no-test-fabrication(unknown): slim AssembleContext double — this path reads only character/characters/characterIds/recentMessages/promptConfig. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  {
    character: { name: "Aria", description: "" },
    characters: [{ name: "Group", description: "" }],
    characterIds: [GROUP_ID],
    recentMessages: [],
    promptConfig: DEFAULT_PROMPT_CONFIG,
    triggerUserId: null,
  } as unknown as AssembleContext;

const KIND_NAMES: HistoryMacroNames = {
  characterNamesById: new Map<CharacterId, RowCharacterName>([[GROUP_ID, { name: "Group" }]]),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

let kindSeq = 0;
/** A canon row that DECLARES its purpose — the only axis these tests vary. */
function kindRow(over: Partial<MessageView> & { readonly kind: MessageView["kind"] }): MessageView {
  kindSeq += 1;
  // @orb-waive no-test-fabrication(unknown): slim MessageView double — toShapeCanon reads role/kind/content/seq/ids/excludedFromPrompt only. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    id: castId<MessageId>(`message_kind_${kindSeq}`),
    seq: kindSeq,
    role: "assistant",
    content: "body",
    authorUserId: null,
    characterId: GROUP_ID,
    personaId: null,
    excludedFromPrompt: false,
    ...over,
  } as unknown as MessageView;
}

describe("toShapeCanon — the PROMPT-POLICY dispatch (kind decides admission, not a truthiness guess)", () => {
  test("a `comment` row NEVER reaches the wire; `standard` and `narrator` both do", () => {
    const canon = [
      kindRow({ kind: "standard", content: "in character" }),
      kindRow({ kind: "comment", content: "OOC: brb, dog" }),
      kindRow({ kind: "narrator", content: "the door opens" }),
    ];
    const rows = toShapeCanon(canon, KIND_CTX, KIND_NAMES, null);
    expect(rows.map((r) => r.content)).toEqual(["in character", "the door opens"]);
  });

  test("the drop survives to the DELIVERED wire — a comment is not merely unlabelled, it is absent", () => {
    const out = shape(
      soloInput({
        canon: toShapeCanon(
          [kindRow({ kind: "standard", content: "in character" }), kindRow({ kind: "comment", content: "OOC: brb, dog" })],
          KIND_CTX,
          KIND_NAMES,
          null,
        ),
        appendUserTurn: null,
        namesBehavior: "content",
      }),
    );
    expect(out.history.some((r) => r.content.includes("OOC"))).toBe(false);
  });

  test("kind rides onto the delivered-row TRACE, so a host can see WHY a row shipped the way it did", () => {
    const out = shape(
      soloInput({
        canon: toShapeCanon([kindRow({ kind: "narrator", content: "the door opens" })], KIND_CTX, KIND_NAMES, null),
        appendUserTurn: null,
      }),
    );
    // The canon row declares narrator; the continuation nudge assembly appends declares nothing (no slot).
    expect(out.stages.delivered.map((r) => r.kind)).toEqual(["narrator", undefined]);
  });
});

describe("the `<speaker>` strip is GATED ON KIND, not applied blind to every assistant row", () => {
  const tagged = "<speaker>Kai</speaker> I'm here.";

  test("a NARRATOR row's tags convert to the plain `NAME:` attribution the wire speaks", () => {
    const rows = toShapeCanon([kindRow({ kind: "narrator", content: tagged })], KIND_CTX, KIND_NAMES, null);
    expect(rows[0]?.content).toBe("Kai: I'm here.");
  });

  test("a STANDARD row's identical bytes are left ALONE — an author's own `<speaker>` prose is not attribution", () => {
    const rows = toShapeCanon([kindRow({ kind: "standard", content: tagged })], KIND_CTX, KIND_NAMES, null);
    expect(rows[0]?.content).toBe(tagged);
  });
});

// ── NARRATOR DELIVERY IS ASSISTANT ON EVERY WIRE (the D129(B) delivered-role dispatch, RULED OUT) ─────
// OWNER RULING 2026-08-18, verbatim: "if you mean group chat narration mode then that is the wrong
// behavior." Group-chat narration mode is ONE generation voicing every seated character — it is the assistant's own
// OUTPUT voice, not an operator/system channel, so it delivers as an `assistant` row on every wire including
// a measured one. The `turns.historySystemRows` MEASUREMENT is honored and stands (the vLLM cell is real and
// the injection SPLICE still reads it, above); what the owner ruled wrong is the SEMANTICS of routing
// narrator canon through that bit.
//
// So these pins run the SAME narrator canon under both capability profiles and demand ONE wire. The
// defect-grade red is the `true` arm: against the pre-ruling `shape.ts` the row ships `system` and the
// assertion fails, which is the ruled-out behavior itself.
describe("shape — a NARRATOR row delivers ASSISTANT on every wire (owner ruling 2026-08-18)", () => {
  const narratorCanon = (): readonly ReturnType<typeof toShapeCanon>[number][] =>
    toShapeCanon(
      [kindRow({ kind: "narrator", content: "The lamp gutters." }), kindRow({ kind: "standard", content: "one voice" })],
      KIND_CTX,
      KIND_NAMES,
      null,
    );

  test("MEASURED wire (historySystemRows true): the narrator row is STILL assistant — no system row anywhere", () => {
    const out = shape(soloInput({ canon: narratorCanon(), appendUserTurn: null, historySystemRows: true }));
    expect(out.history.some((r) => r.role === "system")).toBe(false);
    // Assistant-voiced, and therefore squash-eligible with the standard row beside it, exactly as on every
    // unmeasured wire.
    expect(out.history.find((r) => r.role === "assistant")?.content).toBe("The lamp gutters.\n\none voice");
  });

  test("the capability bit does not reach narrator delivery: true / false / absent produce the IDENTICAL wire", () => {
    const canon = narratorCanon();
    const on = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: true }));
    const off = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: false }));
    const unset = shape(soloInput({ canon, appendUserTurn: null }));
    expect(on.history).toEqual(off.history);
    expect(unset.history).toEqual(off.history);
    // CANON is untouched by either run (the §14 provider-independence invariant at this seam).
    expect(canon.map((r) => `${r.role}:${r.content}`)).toEqual(["assistant:The lamp gutters.", "assistant:one voice"]);
  });

  test("a narrator row is assistant-and-unlabelled on a measured wire too (the label policy is kind, unchanged)", () => {
    for (const namesBehavior of ["content", "completion", "default"] as const) {
      const canon = toShapeCanon([kindRow({ kind: "narrator", content: "The lamp gutters." })], KIND_CTX, KIND_NAMES, null);
      const out = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: true, namesBehavior }));
      const row = out.history.find((r) => r.role === "assistant");
      // No "Group: " (the synthetic card's name), no completion `name`, and the row is in the ASSISTANT
      // voice — the measured capability reaches neither the label policy nor the delivered role.
      expect(row?.content).toBe("The lamp gutters.");
      expect(row?.name).toBeUndefined();
    }
  });

  test("the ends-on-user invariant still holds around the SURVIVING system producer (a depth-0 injection)", () => {
    // The splice is the only thing that can put a `system` row in the delivered history now. The tail check
    // reads the last NON-system row, so a canon ending on assistant still earns its continuation nudge with a
    // capability-kept system row sitting after it.
    const out = shape(
      soloInput({
        canon: narratorCanon(),
        appendUserTurn: null,
        injections: [inChat({ role: "system", content: "GM note" })],
        midConversationSystem: true,
        roleHandlingFloor: "slotted",
      }),
    );
    // The cue lands before the kept system row, so the last NON-system row is the user cue.
    expect(out.history.at(-1)?.role).toBe("system");
    expect(out.history.at(-2)?.role).toBe("user");
  });

  test("a `comment` row is still DROPPED on a measured wire — no capability resurrects one", () => {
    const canon = toShapeCanon([kindRow({ kind: "comment", content: "OOC: brb, dog" })], KIND_CTX, KIND_NAMES, null);
    const out = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: true }));
    expect(out.history.some((r) => r.content.includes("OOC"))).toBe(false);
  });

  test("the EGOCENTRIC FOLD is unaffected: a folded narrator row is a participant `user` line", () => {
    // The scoped fold rewrites another character's row into a `user` line addressed to the target and
    // deliberately KEEPS its kind. It was the one guard the ruled-out dispatch needed; the fold's own
    // behavior is independent of the capability and stays pinned.
    const other = castId<CharacterId>("character_other_speaker");
    const canon = toShapeCanon([kindRow({ kind: "narrator", content: "The lamp gutters.", characterId: other })], KIND_CTX, KIND_NAMES, null);
    const out = shape(
      soloInput({ canon, appendUserTurn: null, historySystemRows: true, output: "per-speaker", cardScope: "scoped", scopedTargetId: GROUP_ID }),
    );
    expect(out.history.some((r) => r.role === "system")).toBe(false);
    expect(out.history.some((r) => r.role === "user" && r.content.includes("The lamp gutters."))).toBe(true);
  });
});

describe("applyNamesBehavior — the LABEL policy is the row's kind (a narrator block is never one identity's line)", () => {
  const narratorBody = "Kai: I'm here.\nThe lamp gutters.";

  for (const namesBehavior of ["content", "completion", "default"] as const) {
    test(`names=${namesBehavior}: a narrator row takes NO row-level speaker label`, () => {
      const out = shape(
        soloInput({
          canon: toShapeCanon([kindRow({ kind: "narrator", content: narratorBody })], KIND_CTX, KIND_NAMES, null),
          appendUserTurn: null,
          namesBehavior,
        }),
      );
      const row = out.history.find((r) => r.role === "assistant");
      // The body rides verbatim: no "Group: " (the synthetic card's name), no "Aria: " (the turn's assistant
      // fallback once that card does not resolve), and no out-of-band completion `name` either.
      expect(row?.content).toBe(narratorBody);
      expect(row?.name).toBeUndefined();
    });
  }

  test("a STANDARD row in the same room still takes its label (the policy narrows, it does not disable)", () => {
    const out = shape(
      soloInput({
        canon: toShapeCanon([kindRow({ kind: "standard", content: "one voice" })], KIND_CTX, KIND_NAMES, null),
        appendUserTurn: null,
        namesBehavior: "content",
      }),
    );
    expect(out.history.find((r) => r.role === "assistant")?.content).toBe("Group: one voice");
  });
});

// The new-chat marker (ST `new_chat_prompt`) is the conversation's opening USER row, delivered bare at the top of
// the history — so a greeting-first chat opens on a user row on every route (owner ruling). It is not an operator
// note, so it takes no note frame.
describe("shape — the new-chat marker opens the history as a bare user row", () => {
  const marker = inChat({ depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" });

  test("greeting-first send: the marker, then the greeting, then the sent turn", () => {
    const canon = [
      { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
      { role: "user" as const, content: "hello", authorName: "User" },
    ];
    const out = shape(soloInput({ canon, appendUserTurn: null, injections: [marker] }));
    expect(out.history).toEqual([
      { role: "user", content: "[Start a new chat]" },
      { role: "assistant", content: "greeting" },
      { role: "user", content: "hello" },
    ]);
  });

  test("no greeting: the marker joins the first user turn", () => {
    const out = shape(soloInput({ canon: [], appendUserTurn: "hello", injections: [marker] }));
    expect(out.history).toEqual([{ role: "user", content: "[Start a new chat]\n\nhello" }]);
  });
});

// ── CUED ROUNDS pin the last canon row before the cue (owner ruling) ───────────────────────────────────────
// A group round cue, a narrator cue and the continuation cue used to make every such round a "second volatile
// tail" with no history breakpoint at all, so group and narrator rooms billed the whole history every round
// (SHAPING-MATRIX §8 defect 3). The canon before SHAPE's own cue is committed, so the cue is the only volatile
// row.
describe("shape — a cued round pins the last canon row before the cue", () => {
  const roundCanon = [
    { role: "assistant" as const, content: "g", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "u1", authorName: "User" },
    { role: "assistant" as const, content: "a1", authorName: "Aria", characterId: ARIA },
  ];

  test("a group round cue", () => {
    const out = shape(soloInput({ canon: roundCanon, appendUserTurn: null, groupNudge: "[Write the next reply only as Kai.]" }));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Write the next reply only as Kai.]" });
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("a1");
  });

  test("a narrator cue", () => {
    const out = shape(soloInput({ canon: roundCanon, appendUserTurn: null, output: "narrator", groupNudge: "[Continue the scene.]" }));
    expect(pinnedRow(out)?.content).toBe("a1");
  });

  test("the continuation cue on a forced turn", () => {
    const out = shape(soloInput({ canon: roundCanon, appendUserTurn: null }));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Continue the conversation.]" });
    expect(pinnedRow(out)?.content).toBe("a1");
  });

  test("the second speaker of a round pins the first speaker's committed reply", () => {
    const afterFirst = [
      ...roundCanon,
      { role: "user" as const, content: "u2", authorName: "User" },
      { role: "assistant" as const, content: "first", authorName: "Kai", characterId: KAI },
    ];
    const out = shape(soloInput({ canon: afterFirst, appendUserTurn: null, groupNudge: "[Write the next reply only as Aria.]" }));
    expect(pinnedRow(out)?.content).toBe("Kai: first");
  });

  test("the first speaker of a round: the sent turn merges with the cue, so the pin is the reply before it", () => {
    const sent = [...roundCanon, { role: "user" as const, content: "u2", authorName: "User" }];
    const out = shape(soloInput({ canon: sent, appendUserTurn: null, groupNudge: "[Write the next reply only as Kai.]" }));
    expect(out.history.at(-1)?.content).toBe("u2\n\n[Write the next reply only as Kai.]");
    expect(pinnedRow(out)?.content).toBe("a1");
  });
});

// ── ROLES FOLLOW THE AUTHOR: the level × turn-shape × injection matrix (owner ruling) ─────────────────────
// A system-role injection keeps its author's position and stays a `system` row only where the level and the
// model take it in that slot; otherwise it folds into user text with a reason. The model here is the measured
// Claude shape (both system facts true), so every fold below is the LEVEL's or the SLOT's doing. SHAPE's own
// cue (group or narrator nudge) goes before a kept trailing system run, never after it.
describe("shape — system rows by level × turn × injection", () => {
  const canon = [
    { role: "assistant" as const, content: "g", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "u1", authorName: "User" },
    { role: "assistant" as const, content: "a1", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "u2", authorName: "User" },
    { role: "assistant" as const, content: "a2", authorName: "Aria", characterId: ARIA },
  ];
  const turns = {
    send: { appendUserTurn: "u3", groupNudge: null, output: "per-speaker" as const },
    continue: { appendUserTurn: "[OOC: continue]", groupNudge: null, output: "per-speaker" as const },
    round: { appendUserTurn: null, groupNudge: "[Write the next reply only as Aria.]", output: "per-speaker" as const },
    narrator: { appendUserTurn: null, groupNudge: "[Continue the scene.]", output: "narrator" as const },
  };
  const injections = {
    "d0 system then user": [inChat({ role: "system", content: "SYS", order: 1 }), inChat({ role: "user", content: "USR", order: 2 })],
    "d0 user then system": [inChat({ role: "user", content: "USR", order: 1 }), inChat({ role: "system", content: "SYS", order: 2 })],
    "d4 system": [inChat({ role: "system", content: "SYS", depth: 4 })],
  };
  type TurnName = keyof typeof turns;
  type InjectionName = keyof typeof injections;
  // Expected delivered roles (A/U/S) and the fold reasons, per level class. `none` and `merge` place system rows
  // anywhere (they differ only in merging); `semi-strict` and `strict` fold every one.
  type MatrixCell = readonly [roles: string, folds: readonly string[]];
  const perSpeakerLike = (
    cells: Record<InjectionName, MatrixCell>,
    rounds: Record<InjectionName, MatrixCell>,
  ): Record<TurnName, Record<InjectionName, MatrixCell>> => ({
    send: cells,
    continue: cells,
    round: rounds,
    narrator: rounds,
  });
  const expected: Record<"none" | "merge" | "slotted" | "folds", Record<TurnName, Record<InjectionName, MatrixCell>>> = {
    none: perSpeakerLike(
      { "d0 system then user": ["AUAUAUSU", []], "d0 user then system": ["AUAUAUUS", []], "d4 system": ["AUSAUAU", []] },
      { "d0 system then user": ["AUAUASUU", []], "d0 user then system": ["AUAUAUUS", []], "d4 system": ["ASUAUAU", []] },
    ),
    merge: perSpeakerLike(
      { "d0 system then user": ["AUAUAUSU", []], "d0 user then system": ["AUAUAUS", []], "d4 system": ["AUSAUAU", []] },
      { "d0 system then user": ["AUAUASU", []], "d0 user then system": ["AUAUAUS", []], "d4 system": ["ASUAUAU", []] },
    ),
    slotted: perSpeakerLike(
      { "d0 system then user": ["AUAUAU", ["slot"]], "d0 user then system": ["AUAUAUS", []], "d4 system": ["AUSAUAU", []] },
      { "d0 system then user": ["AUAUAU", ["slot"]], "d0 user then system": ["AUAUAUS", []], "d4 system": ["AUAUAU", ["slot"]] },
    ),
    folds: perSpeakerLike(
      { "d0 system then user": ["AUAUAU", ["level"]], "d0 user then system": ["AUAUAU", ["level"]], "d4 system": ["AUAUAU", ["level"]] },
      { "d0 system then user": ["AUAUAU", ["level"]], "d0 user then system": ["AUAUAU", ["level"]], "d4 system": ["AUAUAU", ["level"]] },
    ),
  };
  /** The row the cache pins: the last reply before this turn's rows, or — with the depth-4 note — the row above
   *  it. On a send the note lands under u1 (the pin is u1, or the greeting when the note folds into u1); on a
   *  cued round it lands under the greeting. */
  const expectedPin = (level: RoleHandling, turn: TurnName, injection: InjectionName): string => {
    if (injection !== "d4 system") {
      return "a2";
    }
    if (turn === "round" || turn === "narrator") {
      return "g";
    }
    return SYSTEM_ROW_PLACEMENT[level] === "fold" ? "g" : "u1";
  };
  const levelClass: Record<RoleHandling, keyof typeof expected> = { none: "none", merge: "merge", slotted: "slotted", "semi-strict": "folds", strict: "folds" };
  const roleLetter = { assistant: "A", user: "U", system: "S" } as const;

  for (const level of ROLE_HANDLING) {
    for (const turn of Object.keys(turns) as TurnName[]) {
      for (const injection of Object.keys(injections) as InjectionName[]) {
        test(`${level} · ${turn} · ${injection}`, () => {
          const out = shape(
            soloInput({
              canon,
              ...turns[turn],
              injections: injections[injection],
              midConversationSystem: true,
              historySystemRows: true,
              roleHandlingFloor: level,
            }),
          );
          const [roles, folds] = expected[levelClass[level]][turn][injection];
          expect(out.history.map((row) => roleLetter[row.role]).join("")).toBe(roles);
          expect(out.stages.delivered.flatMap((row) => (row.folded === undefined ? [] : [row.folded]))).toStrictEqual(folds);
          // The cache pin: the last stable row above every injection and every row this turn wrote.
          expect(out.breakpointDecision).toBe("placed");
          expect(pinnedRow(out)?.content).toBe(expectedPin(level, turn, injection));
          // Every turn's last non-system row is a user row: SHAPE's cue never lands after a kept system row.
          expect(out.history.findLast((row) => row.role !== "system")?.role).toBe("user");
        });
      }
    }
  }

  test("a slotted turn never delivers a system row right after an assistant row", () => {
    for (const turn of Object.keys(turns) as TurnName[]) {
      for (const injection of Object.keys(injections) as InjectionName[]) {
        const [roles] = expected.slotted[turn][injection];
        expect(roles, `${turn} · ${injection}`).not.toMatch(/AS/);
      }
    }
  });

  test("the fold frame is the neutral system frame, and a folded row never wears a speaker label", () => {
    const out = shape(
      soloInput({
        canon,
        ...turns.round,
        injections: injections["d4 system"],
        namesBehavior: "content",
        midConversationSystem: true,
        historySystemRows: true,
        roleHandlingFloor: "slotted",
      }),
    );
    expect(out.history[1]?.content).toBe("[Take the following into special consideration: SYS]\n\nUser: u1");
  });
});
