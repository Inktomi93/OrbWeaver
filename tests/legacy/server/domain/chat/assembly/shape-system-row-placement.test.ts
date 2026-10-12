// SHAPE substrate — where the system rows sit: the shipped per-turn sections, mid-history injections, the level × turn × injection matrix, folded notes and prefix-bound cues.

import type { ChatReasoningPart, ShapeFoldReason } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/inference";
import { ROLE_HANDLING, SYSTEM_ROW_PLACEMENT } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { AssetId, CharacterId, MessageId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { assemblePrompt } from "#server/domain/chat/assembly/assemble.ts";
import type { DeliveredCue } from "./_shape-support.ts";
import { ARIA, BEFORE_HISTORY_DEPTH, buildWireHistory, inChat, KAI, pinnedRow, SPEAKERS, shape, soloInput } from "./_shape-support.ts";

// ── THE SHIPPED ARRANGEMENT'S PER-TURN SECTIONS (D251) ─────────────────────────────
// D251 keeps every section where the prompt order puts it, so a per-turn section listed ABOVE Chat History
// changes the system prompt every turn and costs the whole history its cache. The built-in preset therefore lists
// Memory, Databank and Guided instruction BELOW the pivot. Asserted through the real build walk and the real
// SHAPE, never the array order alone: the walk turns each into a depth-0 `in_chat` system injection, and SHAPE
// keeps that as a trailing system row where the model takes one and folds it bare into the user tail elsewhere.
describe("shape — the built-in preset delivers memory, databank and the guided instruction at the tail", () => {
  const perTurn = ["memory-value", "databank-value", "guided-value"] as const;
  const [memory, databank, guidedInstruction] = perTurn;
  /** Where each per-turn value sits in `text`, in the preset's order (-1 when absent). */
  const offsets = (text: string): number[] => perTurn.map((value) => text.indexOf(value));
  const assembled = assemblePrompt(DEFAULT_PROMPT_CONFIG, {
    timezone: UTC_TIME_ZONE,
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: DEFAULT_PROMPT_CONFIG,
    recentMessages: [],
    memory,
    databank,
    guidedInstruction,
  });

  test("the build walk leaves all three out of the system prompt and hands them over as depth-0 system injections", () => {
    const systemPrompt = `${assembled.static}\n${assembled.dynamic}`;
    expect(offsets(systemPrompt)).toEqual([-1, -1, -1]);
    expect(assembled.trace.afterHistorySections).toEqual(["memory", "databank", "guided-instruction"]);
    expect(assembled.afterHistory.map((inj) => ({ position: inj.position, depth: inj.depth, role: inj.role }))).toEqual([
      { position: "in_chat", depth: 0, role: "system" },
      { position: "in_chat", depth: 0, role: "system" },
      { position: "in_chat", depth: 0, role: "system" },
    ]);
    expect(assembled.afterHistory.map((inj) => perTurn.find((value) => inj.content.includes(value)))).toEqual([...perTurn]);
  });

  test("a model that takes a trailing system row gets them as system content after the user's turn", () => {
    const out = shape(soloInput({ injections: assembled.afterHistory, midConversationSystem: true, roleHandlingFloor: "slotted" }));
    expect(out.history.at(-2)).toEqual({ role: "user", content: "u2 volatile" });
    const tail = out.history.at(-1);
    expect(tail?.role).toBe("system");
    const at = offsets(tail?.content ?? "");
    expect(at.every((offset) => offset >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    // The canon prefix is untouched by the per-turn content, so the pin still lands on the committed reply.
    expect(pinnedRow(out)?.content).toBe("a1 tip");
  });

  // Both ways a model refuses the trailing system row: the fail-closed floor folds every system row (`level`), and a
  // permissive level on a model without `midConversationSystem` folds the trailing run (`tail`).
  const refusals: readonly { readonly over: Partial<Parameters<typeof shape>[0]>; readonly reason: ShapeFoldReason }[] = [
    { over: {}, reason: "level" },
    { over: { roleHandlingFloor: "slotted" }, reason: "tail" },
  ];
  for (const { over, reason } of refusals) {
    test(`any other model gets them folded bare into the user tail, after the user's own text (${reason})`, () => {
      const out = shape(soloInput({ injections: assembled.afterHistory, ...over }));
      expect(out.history.some((row) => row.role === "system")).toBe(false);
      const tail = out.history.at(-1);
      expect(tail?.role).toBe("user");
      const content = tail?.content ?? "";
      expect(content.startsWith("u2 volatile")).toBe(true);
      const at = offsets(content);
      expect(at.every((offset) => offset > "u2 volatile".length)).toBe(true);
      expect(at).toEqual([...at].sort((a, b) => a - b));
      expect(out.stages.delivered.at(-1)?.folded).toBe(reason);
    });
  }
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

  test("unmeasured wire (the default): the note folds into user text, and unset reads as false", () => {
    const off = shape(soloInput({ injections: [deepSys], historySystemRows: false }));
    const unset = shape(soloInput({ injections: [deepSys] }));
    expect(unset.history).toEqual(off.history);
    expect(unset.history.some((r) => r.role === "system")).toBe(false);
    expect(unset.history.some((r) => r.role === "user" && r.content.split("\n\n").includes("GM note"))).toBe(true);
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

// Injected RPG instructions must not be named as player prose. namesBehavior=content is the sharpest
// probe: the player turn must be labeled while game state, teaching, and steering injections must not
// acquire a player label.
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
    // (Live, with the real speaker name, this read `Alex:` TWICE in one 3,037-char user message.)
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
    // @orb-waive no-test-fabrication(TurnName[]): baselined when the gate widened to value casts; burn-down item 906.
    for (const turn of Object.keys(turns) as TurnName[]) {
      // @orb-waive no-test-fabrication(InjectionName[]): baselined when the gate widened to value casts; burn-down item 906.
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
    // @orb-waive no-test-fabrication(TurnName[]): baselined when the gate widened to value casts; burn-down item 906.
    for (const turn of Object.keys(turns) as TurnName[]) {
      // @orb-waive no-test-fabrication(InjectionName[]): baselined when the gate widened to value casts; burn-down item 906.
      for (const injection of Object.keys(injections) as InjectionName[]) {
        const [roles] = expected.slotted[turn][injection];
        expect(roles, `${turn} · ${injection}`).not.toMatch(/AS/);
      }
    }
  });

  test("a folded note goes bare and never wears a speaker label", () => {
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
    expect(out.history[1]?.content).toBe("SYS\n\nUser: u1");
  });
});

// ── A FOLDED SYSTEM NOTE LEADS THE USER TEXT IT JOINS (OR-11, owner ruling) ────────────────────────────────
// A system row the model does not take folds into user text bare, before the user text of the message it joins,
// at its own depth. Joined after that text, sonnet-5, opus-4-8 and haiku-4-5 mostly ignored it
// (`scripts/probes/openrouter/RESULTS.md` OR-11). A trailing fold stays after the latest user text, where the
// probe measured it carried.
describe("shape — a folded system note leads the user text it joins", () => {
  const ids = { g: mintTypeId("message"), u1: mintTypeId("message"), uA: mintTypeId("message"), uB: mintTypeId("message"), a1: mintTypeId("message") };
  const greeting = { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA, messageId: ids.g };
  const u1 = { role: "user" as const, content: "u1", authorName: "User", messageId: ids.u1 };
  const a1 = { role: "assistant" as const, content: "a1", authorName: "Aria", characterId: ARIA, messageId: ids.a1 };
  const canon = [greeting, u1, a1];
  const humans = [
    greeting,
    { role: "user" as const, content: "I open the door.", authorName: "Alex", messageId: ids.uA },
    { role: "user" as const, content: "I follow him in.", authorName: "Joe", messageId: ids.uB },
    a1,
  ];
  const depthNote = inChat({ depth: 2, role: "system", content: "NOTE" });
  const wire = (out: ReturnType<typeof shape>): [string, string][] => out.history.map((row) => [row.role, row.content]);

  test("a depth-N fold goes bare before the user text of the row above it, at its own depth", () => {
    const out = shape(soloInput({ canon, appendUserTurn: "u2", injections: [depthNote] }));
    expect(wire(out)).toEqual([
      ["assistant", "greeting"],
      ["user", "NOTE\n\nu1"],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
    // The merged row keeps the stored row's identity, so its attachments and spans still resolve.
    expect(out.history[1]?.messageId).toBe(ids.u1);
    expect(out.stages.delivered.map((row) => row.folded)).toEqual([undefined, "level", undefined, undefined]);
  });

  test("a trailing fold stays bare after the latest user text", () => {
    const out = shape(soloInput({ canon, appendUserTurn: "u2", injections: [inChat({ depth: 0, role: "system", content: "NOTE" })] }));
    expect(wire(out).at(-1)).toEqual(["user", "u2\n\nNOTE"]);
  });

  test("the fold leads the whole user message, and every speaker label stays on its own text", () => {
    const joined = shape(soloInput({ canon: humans, appendUserTurn: "u2", injections: [depthNote], multiHuman: true }));
    expect(wire(joined)).toEqual([
      ["assistant", "greeting"],
      ["user", "NOTE\n\nAlex: I open the door.\n\nJoe: I follow him in."],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
    // A block-marker wire keeps each stored row its own block: the note opens the first block of the message.
    const apart = shape(soloInput({ canon: humans, appendUserTurn: "u2", injections: [depthNote], multiHuman: true, explicitCacheMarkers: true }));
    expect(wire(apart)).toEqual([
      ["assistant", "greeting"],
      ["user", "NOTE\n\nAlex: I open the door."],
      ["user", "Joe: I follow him in."],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
    expect(apart.history.slice(1, 3).map((row) => row.messageId)).toEqual([ids.uA, ids.uB]);
  });

  test("a level that never joins rows moves the note only past the user row it follows", () => {
    const none = { roleHandling: "none" as const, roleHandlingFloor: "none" as const };
    const out = shape(soloInput({ canon: humans, appendUserTurn: "u2", injections: [depthNote], multiHuman: true, ...none }));
    expect(wire(out)).toEqual([
      ["assistant", "greeting"],
      ["user", "Alex: I open the door."],
      ["user", "NOTE"],
      ["user", "Joe: I follow him in."],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
  });

  test("the fold never moves above the new-chat marker", () => {
    const marker = inChat({ depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" });
    const out = shape(soloInput({ canon: [u1, a1], appendUserTurn: "u2", injections: [marker, depthNote] }));
    expect(wire(out)[0]).toEqual(["user", "[Start a new chat]\n\nNOTE\n\nu1"]);
  });

  test("a fold next to a multi-part user message opens its first text part", async () => {
    const picture = mintTypeId("asset");
    const withImage = [greeting, { ...u1, content: `look ![my reference](asset:${picture})` }, a1];
    const out = shape(soloInput({ canon: withImage, appendUserTurn: "u2", injections: [depthNote] }));
    const converted = await buildWireHistory(
      {
        visionOk: true,
        videoOk: false,
        resolveImageUrl: (ref) => Promise.resolve({ url: ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url, media: "image" as const }),
        cardKeepLastX: undefined,
        canon: [],
        reasoningByMessage: new Map<MessageId, readonly ChatReasoningPart[]>(),
        loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
      },
      out.history,
    );
    expect(converted[1]?.row).toEqual({
      role: "user",
      content: [
        { type: "text", text: "NOTE\n\nlook " },
        { type: "image", url: `https://cas.test/${picture}` },
      ],
    });
  });

  test("a turn with no fold ships the same bytes: labels, blocks and kept system rows", () => {
    expect(wire(shape(soloInput({ canon: humans, appendUserTurn: "u2", multiHuman: true })))).toEqual([
      ["assistant", "greeting"],
      ["user", "Alex: I open the door.\n\nJoe: I follow him in."],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
    expect(wire(shape(soloInput({ canon: humans, appendUserTurn: "u2", multiHuman: true, explicitCacheMarkers: true })))).toEqual([
      ["assistant", "greeting"],
      ["user", "Alex: I open the door."],
      ["user", "Joe: I follow him in."],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
    const kept = shape(soloInput({ canon, appendUserTurn: "u2", injections: [depthNote], historySystemRows: true, roleHandlingFloor: "slotted" }));
    expect(wire(kept)).toEqual([
      ["assistant", "greeting"],
      ["user", "u1"],
      ["system", "NOTE"],
      ["assistant", "a1"],
      ["user", "u2"],
    ]);
  });

  test("the fold is byte-stable for the same history, and the rows the cache pins above it hold one turn later", () => {
    const turnN = soloInput({ canon, appendUserTurn: "u2", injections: [depthNote] });
    const n = shape(turnN);
    expect(wire(shape(turnN))).toEqual(wire(n));

    const grown = [
      ...canon,
      { role: "user" as const, content: "u2", authorName: "User", messageId: mintTypeId("message") },
      { role: "assistant" as const, content: "a2", authorName: "Aria", characterId: ARIA, messageId: mintTypeId("message") },
    ];
    const n1 = shape(soloInput({ canon: grown, appendUserTurn: "u3", injections: [depthNote] }));
    // Turn N pins the greeting, the row above the fold, and turn N+1 still opens with it byte for byte.
    expect(pinnedRow(n)?.content).toBe("greeting");
    const cachedAtN = wire(n).slice(0, n.history.length - (n.cacheBreakpointFromEnd ?? n.history.length));
    expect(cachedAtN).toEqual([["assistant", "greeting"]]);
    expect(wire(n1).slice(0, cachedAtN.length)).toEqual(cachedAtN);
    // One turn later the note has moved down with its depth and leads the next user row instead.
    expect(wire(n1)[3]).toEqual(["user", "NOTE\n\nu2"]);
    expect(pinnedRow(n1)?.content).toBe("a1");
  });
});

// ── A PREFIX-BOUND CARRY REPLAYS EVERY CUE (OR-10) ─────────────────────────────────────────────────────────
// Opus 5.5 and Fable 5.1 bind each carried thinking block to every row before it, so a cue that is gone on the
// next call drops every later reply's thinking. With a replay, each turn's delivered history must be a literal
// prefix of the next turn's: the cue each reply followed comes back in the role the live turn gave it.
describe("shape — a prefix-bound carry keeps every cue", () => {
  const kaiCue = "[Write the next reply only as Kai.]";
  const ariaCue = "[Write the next reply only as Aria.]";
  type StoredRow = Parameters<typeof shape>[0]["canon"][number] & { readonly messageId: MessageId };
  const row = (role: "user" | "assistant", content: string, authorName: string, characterId?: CharacterId): StoredRow => ({
    role,
    content,
    authorName,
    messageId: mintTypeId("message"),
    ...(characterId === undefined ? {} : { characterId }),
  });
  // Both characters speak before the round, so the name-stamp labels every reply the same way on every turn.
  const opening = [row("assistant", "g", "Aria", ARIA), row("user", "u1", "User"), row("assistant", "a1", "Kai", KAI), row("user", "u2", "User")];
  const kaiReply = row("assistant", "first", "Kai", KAI);
  const ariaReply = row("assistant", "second", "Aria", ARIA);
  const nextSend = row("user", "u3", "User");

  function stampOf(turn: ReturnType<typeof shape>): DeliveredCue {
    if (turn.cue === null) {
      throw new Error("the turn delivered no cue to stamp");
    }
    return turn.cue;
  }

  /** One group round and the send after it, each turn shaped with the cues the replies before it were stamped with. */
  function round(model: Partial<Parameters<typeof shape>[0]>, turnScoped: boolean): ReturnType<typeof shape>[] {
    const stamped = new Map<MessageId, DeliveredCue>();
    const turn = (canon: Parameters<typeof shape>[0]["canon"], groupNudge: string): ReturnType<typeof shape> =>
      shape(soloInput({ ...model, canon, appendUserTurn: null, groupNudge, cueReplay: { cues: new Map(stamped), turnScoped } }));
    const kaiTurn = turn(opening, kaiCue);
    stamped.set(kaiReply.messageId, stampOf(kaiTurn));
    const ariaTurn = turn([...opening, kaiReply], ariaCue);
    stamped.set(ariaReply.messageId, stampOf(ariaTurn));
    const sendTurn = turn([...opening, kaiReply, ariaReply, nextSend], kaiCue);
    return [kaiTurn, ariaTurn, sendTurn];
  }

  const startsWith = (later: ReturnType<typeof shape>, earlier: ReturnType<typeof shape>): void => {
    expect(later.history.slice(0, earlier.history.length)).toEqual(earlier.history);
  };

  test("cues as kept user rows (S2c): every turn's history opens with the one before it", () => {
    const [kaiTurn, ariaTurn, sendTurn] = round({}, false);
    expect(kaiTurn?.cue).toEqual({ text: kaiCue, role: "user" });
    expect(ariaTurn?.history.at(-1)).toEqual({ role: "user", content: ariaCue });
    startsWith(ariaTurn as ReturnType<typeof shape>, kaiTurn as ReturnType<typeof shape>);
    startsWith(sendTurn as ReturnType<typeof shape>, ariaTurn as ReturnType<typeof shape>);
  });

  test("a cue after a user row rides turn-scoped where the model takes it (S2), and a cue after a reply stays a user row", () => {
    const measuredClaude = { roleHandlingFloor: "slotted", midConversationSystem: true, historySystemRows: true } as const;
    const [kaiTurn, ariaTurn, sendTurn] = round(measuredClaude, true);
    expect(kaiTurn?.history.at(-1)).toEqual({ role: "system", content: kaiCue, turnScoped: true });
    expect(ariaTurn?.history.at(-1)).toEqual({ role: "user", content: ariaCue });
    startsWith(ariaTurn as ReturnType<typeof shape>, kaiTurn as ReturnType<typeof shape>);
    startsWith(sendTurn as ReturnType<typeof shape>, ariaTurn as ReturnType<typeof shape>);
    // The replayed cues are committed bytes, so the cache still pins the newest stored reply.
    expect(sendTurn?.breakpointDecision).toBe("placed");
    expect(pinnedRow(sendTurn as ReturnType<typeof shape>)?.content).toBe("u3");
  });

  // The stored role is the delivered role: a user-row cue stays a user row where the turn could now send a system
  // row, and a turn-scoped cue replays as a user row only where this turn cannot send a system row at all.
  test("a replayed cue keeps its stored role, and falls back to a user row only where no system row may go", () => {
    const slotted = { roleHandlingFloor: "slotted", midConversationSystem: true, historySystemRows: true } as const;
    const replayed = (role: DeliveredCue["role"], model: Partial<Parameters<typeof shape>[0]>): ReturnType<typeof shape>["history"] =>
      shape(
        soloInput({
          ...model,
          canon: [...opening, kaiReply],
          appendUserTurn: null,
          groupNudge: ariaCue,
          cueReplay: { cues: new Map([[kaiReply.messageId, { text: kaiCue, role }]]), turnScoped: true },
        }),
      ).history;
    expect(replayed("user", slotted).at(-3)).toMatchObject({ role: "user", content: `u2\n\n${kaiCue}` });
    expect(replayed("turn-scoped-system", slotted).at(-3)).toEqual({ role: "system", content: kaiCue, turnScoped: true });
    expect(replayed("turn-scoped-system", { ...slotted, roleHandlingFloor: "strict" }).at(-3)).toMatchObject({ role: "user", content: `u2\n\n${kaiCue}` });
  });

  test("a level that folds every system row keeps the cue a user row", () => {
    const [kaiTurn] = round({ roleHandlingFloor: "strict", midConversationSystem: true, historySystemRows: true }, true);
    expect(kaiTurn?.history.at(-1)).toMatchObject({ role: "user", content: `u2\n\n${kaiCue}` });
  });

  test("a turn-scoped cue reaches the wire with clearAt", async () => {
    const [kaiTurn] = round({ roleHandlingFloor: "slotted", midConversationSystem: true, historySystemRows: true }, true);
    const converted = await buildWireHistory(
      {
        visionOk: false,
        videoOk: false,
        resolveImageUrl: () => Promise.resolve(null),
        cardKeepLastX: undefined,
        canon: [],
        reasoningByMessage: new Map<MessageId, readonly ChatReasoningPart[]>(),
        loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
      },
      kaiTurn?.history ?? [],
    );
    expect(converted.at(-1)?.row).toEqual({ role: "system", content: [{ type: "text", text: kaiCue }], wireMeta: { clearAt: "next_user_message" } });
  });
});
