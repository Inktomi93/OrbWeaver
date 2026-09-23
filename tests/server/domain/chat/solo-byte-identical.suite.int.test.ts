// Gate 7 — the D16 SOLO-BYTE-IDENTICAL property suite (cross-cutting, mirror-exempt).
// D16: solo is not a mode — a solo chat IS a group of one, and the group machinery must be a
// structural NO-OP at one character (no `if (isGroup)` anywhere — the active no-if-is-group grit is the
// static half; THIS suite is the behavioral half). Two identically-shaped chats drive ONE round each
// through the REAL engine (chunk-9 `createTurnEngine` + libSQL + a scripted role runner capturing the
// wire request): posture A is the untouched solo room (`DEFAULT_GROUP_CONFIG`), posture B is a fully
// group-configured room (speakerTags ON, cardScope `scoped`) that happens to have ONE member. The
// wire product and the persisted canon must be BYTE-identical — the knobs are fenced on runtime
// facts (`multi = speakers.length > 1` for the nudge; `hasMultipleCharacters` distinct-author count
// for the name-stamp; a scoped fold with no foreign-author rows folds nothing), never on room mode.
// (`speakerTags` itself never reaches the engine — it rides GroupConfig for the client; the engine's
// names behavior keys on `promptConfig.namesBehavior` + the distinct-author fence. Asserting B with
// it ON still pins the config-carrying room end-to-end.)

import type { AssembleContext, ChatBusEvent, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { TurnEngine, TurnRequest } from "../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine.ts";
import { driveRound } from "../../../../packages/server/src/domain/chat/engine/round.ts";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { loadCanonHistory } from "../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeChatContext, scriptedRoleTurn, seedCharacter, seedChat, seedMessage, seedUser, stubRunCompaction, testConnection } from "./_support.ts";

const HOST = castId<UserId>("user_host");
const ARIA = castId<CharacterId>("character_aria");

const GROUP_CHAR = castId<CharacterId>("character_group");

// The ctx MUST carry a real `characters`/`speakerRefs` or this whole suite is vacuous for the card-shape
// (`shapeContextForSpeaker` returns the ctx UNTOUCHED when either is absent, so every posture would take
// the same early return and the arms under test would never run). A roster of ONE is the D16 subject.
const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  characters: [{ name: "Aria", description: "a bold knight" }],
  speakerRefs: [{ kind: "character", characterId: ARIA }],
  recentMessages: [],
};

/** Posture B — a room that has ALL the group knobs a host can set, with one member. */
const GROUP_OF_ONE: GroupConfig = {
  ...DEFAULT_GROUP_CONFIG,
  output: "per-speaker",
  speakerTags: true,
  cardScope: "scoped",
};

/** Posture C — the NARRATOR arm at one character. Its round is authored by the synthetic group character and its
 *  card shape takes a different branch entirely (`{kind:"multi-voice"}` speaker + all-characters co-speakers), so it is
 *  the posture most able to break D16 — and the one the suite could not see before, because the shared ctx
 *  carried no characters at all. `speakerTags` rides ON (its narrator default) to pin the config-carrying room. */
//  Spelled out rather than spread from the default: the narrator arm is `z.strictObject` and OMITS
//  `cardScope` by construction (narrator ⇒ merged is unrepresentable, not merely unwritten).
const NARRATOR_OF_ONE: GroupConfig = {
  output: "narrator",
  policy: DEFAULT_GROUP_CONFIG.policy,
  speakerTags: true,
  groupNudge: DEFAULT_GROUP_CONFIG.groupNudge,
  autoMode: DEFAULT_GROUP_CONFIG.autoMode,
  autoModeMaxTurns: DEFAULT_GROUP_CONFIG.autoModeMaxTurns,
  autoModeDelayMs: DEFAULT_GROUP_CONFIG.autoModeDelayMs,
  allowSelfResponses: DEFAULT_GROUP_CONFIG.allowSelfResponses,
  memberCardVisibility: DEFAULT_GROUP_CONFIG.memberCardVisibility,
};

function realEngine(database: Db, requests: TurnRequest[]): TurnEngine {
  const ctx = makeChatContext(database, {
    runChatTurn: scriptedRoleTurn(requests),
    applyStatsDelta: (): void => undefined,
  });
  return createTurnEngine(ctx, {
    emit: (_e: ChatBusEvent): Promise<void> => Promise.resolve(),

    holder: "tester",
    lockTtlMs: 1000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
}

/** An identically-shaped chat per posture: same canon (2 user turns + 1 Aria turn), only ids differ. */
async function seedPosture(database: Db, key: string): Promise<ChatId> {
  const chatId = await seedChat(database, key);
  await seedMessage(database, chatId, 1, {
    role: "user",
    authorUserId: HOST,
    content: "hello there",
  });
  await seedMessage(database, chatId, 2, { characterId: ARIA, content: "well met, traveler" });
  await seedMessage(database, chatId, 3, {
    role: "user",
    authorUserId: HOST,
    content: "tell me more",
  });
  return chatId;
}

/** Drive ONE single-speaker round under `group`; return the captured wire request + the new canon. */
async function runPosture(
  database: Db,
  chatId: ChatId,
  group: GroupConfig,
): Promise<{ req: TurnRequest; newRow: { role: string; characterId: unknown; content: string } }> {
  const requests: TurnRequest[] = [];
  const outcome = await driveRound({
    engine: realEngine(database, requests),
    base: {
      chatId,
      assembleContext: ASSEMBLE_CTX,
      connection: testConnection(),
      triggeredBy: HOST,
      funderUserId: HOST,
      runAsUserId: HOST,
      kind: "auto",
      intent: {},
    },
    group,
    speakers: [{ ref: { kind: "character", characterId: ARIA }, name: "Aria" }],
    // A narrator round is authored by the synthetic group character (`roundSpeakers` THROWS on a null here);
    // every other posture ignores it. `narratorSpeakerName` is the joined present characters, which at one character IS "Aria" — the
    // same label the per-speaker postures stamp, which is exactly what makes the byte comparison meaningful.
    groupCharacterId: group.output === "narrator" ? GROUP_CHAR : null,
    narratorSpeakerName: "Aria",
    // The nudge's own single-character guard: `narratorMemberNames.length <= 1` ⇒ no narrator nudge at all, the
    // twin of `multi` for the per-speaker fence. Passing the REAL one-member list drives that guard instead
    // of dodging it with `[]`.
    narratorMemberNames: ["Aria"],
  });
  expect(outcome.aborted).toBe(false);
  expect(requests).toHaveLength(1);
  const history = await loadCanonHistory(database, chatId);
  const tail = history.at(-1);
  if (requests[0] === undefined || tail === undefined) {
    throw new Error("posture run produced no request/row");
  }
  return {
    req: requests[0],
    newRow: { role: tail.role, characterId: tail.characterId, content: tail.content },
  };
}

/** The wire-comparable projection: everything the runner would send (connection/signal excluded —
 *  the same literal object / absent in both). Serialized so the assertion is BYTE equality. */
function wireBytes(req: TurnRequest): string {
  return JSON.stringify({
    prompt: req.prompt,
    history: req.history,
    intent: req.intent,
    kind: req.kind,
    cacheBreakpointFromEnd: req.cacheBreakpointFromEnd,
  });
}

function historyText(req: TurnRequest): string {
  return req.history.flatMap((m) => m.content.map((p) => (p.type === "text" ? p.text : ""))).join("\n");
}

/** Each posture gets its OWN fresh db with the SAME chat key — so every id (seeded rows AND the
 *  engine-minted turn ids) is identical across postures and the byte comparison covers everything. */
async function makePosture(group: GroupConfig): Promise<ReturnType<typeof runPosture>> {
  const database = await freshDb();
  await seedUser(database, castId<Handle>("host"));
  await seedCharacter(database, HOST, "aria");
  // The narrator posture commits its row under the synthetic group character — a real FK, so it needs a real
  // row. Seeded for EVERY posture so the db shape (and therefore every minted id) stays identical across them.
  await seedCharacter(database, HOST, "group");
  const chatId = await seedPosture(database, "c");
  return runPosture(database, chatId, group);
}

describe("D16 solo ≡ group-of-one (the byte-identical property)", () => {
  test("the wire request is BYTE-identical: untouched solo room vs fully group-configured roster of one", async () => {
    const solo = await makePosture(DEFAULT_GROUP_CONFIG);
    const grouped = await makePosture(GROUP_OF_ONE);

    // The headline: byte equality of the full wire product (BUILD halves + SHAPEd history + params).
    expect(wireBytes(grouped.req)).toBe(wireBytes(solo.req));

    // The seeded canon actually flowed (the equality isn't vacuous-empty).
    expect(historyText(solo.req)).toContain("well met, traveler");
  });

  test("the group knobs are runtime-fenced, not mode-fenced: no nudge, no name-stamp at one character", async () => {
    const { req } = await makePosture(GROUP_OF_ONE);

    // groupNudge is ON in the config — fenced by `multi` (speakers.length > 1), so it never renders.
    expect(historyText(req)).not.toContain("[Write the next reply only as");
    // The name-stamp is fenced by hasMultipleCharacters (distinct authors), not by the room's config —
    // one authoring character ⇒ no `Aria:` prefix anywhere in the delivered transcript.
    expect(historyText(req)).not.toContain("Aria:");
  });

  // The NARRATOR arm at one character. Added 2026-08-07 after a verifier found this suite VACUOUS for the card
  // shape: the shared ctx carried no `characters`/`speakerRefs`, so both postures took `shapeContextForSpeaker`'s
  // absent-characters early return and 3/3 green proved nothing about the arm. It now carries a real roster of one
  // and drives the branch that most plausibly breaks D16 — an all-characters speaker arm and all-characters card merge.
  //
  // AMENDED 2026-08-08 (C4, the mode-aware main_prompt default; ruled by the orchestrator 2026-08-08) —
  // READ THIS BEFORE "RESTORING" THE OLD FORM. The original assertion was
  // `wireBytes(narrator.req) === wireBytes(solo.req)`, whole. It no longer holds, by design and by exactly
  // ONE section: the factory `main_prompt` default now resolves per turn MODE (`assembly/assemble`
  // templateFor, keyed on `speaker.kind === "multi-voice"` — the same axis `memberHeadingSlot` uses), because
  // "write {{char}}'s perspective only" is an instruction a narrator round cannot obey.
  //   1. D16 bans branching on group-NESS/SIZE ("no `if (isGroup)`; solo = roster-of-1, byte-identical").
  //      Gating the framing on `members.length > 1` to keep this line green IS that forbidden shape — a
  //      roster-size branch deciding wire bytes. Keying on the host-CHOSEN output mode is D16 honored:
  //      the mode is config DATA and the selection reads the speaker arm the SHAPE already produced.
  //   2. The 2026-08-07 stance ("narrator-of-one ≡ solo") rested on a premise this ruling kills: a narrator
  //      room of one is still a NARRATOR room — the host asked for a third-person voice narrating Aria AND
  //      the world, and "write Aria's perspective only" contradicts the mode they chose. A ruling whose
  //      premise dies gets re-ruled, not defended.
  //   3. The narrator arm was never byte-identical in the PERSISTED plane either — its canon row commits
  //      under the synthetic group character, which is why the canon test below compares only the
  //      per-speaker postures. The identity claim was always WIRE-ONLY, and this marker is now its one
  //      deliberate wire exception.
  //   4. This does NOT touch the ≤1-character nudge suppression below, and the two are not in tension: the NUDGE
  //      teaches multi-SPEAKER mechanics (size-relevant, so it vanishes at one), while the MARKER states the
  //      round's IDENTITY (mode-relevant, so it holds at any size). Do not flatten them into one rule.
  test("the NARRATOR arm at one character degrades to the solo shape — byte-identical but for the mode's own framing", async () => {
    const solo = await makePosture(DEFAULT_GROUP_CONFIG);
    const narrator = await makePosture(NARRATOR_OF_ONE);

    // Sections join with a blank line: the framing is the FIRST block, everything after it is the shape D16
    // is about (the cards, the persona, the history, the params).
    const [narratorFraming, ...narratorRest] = narrator.req.prompt.static.split("\n\n");
    const [soloFraming, ...soloRest] = solo.req.prompt.static.split("\n\n");
    expect(narratorRest).toEqual(soloRest);
    // …and the WHOLE wire product is byte-identical once that one section is put back — so nothing else
    // (history, intent, kind, cache breakpoint, trace, the dynamic half) diverged with it.
    const restored = { ...narrator.req, prompt: { ...narrator.req.prompt, static: solo.req.prompt.static } };
    expect(wireBytes(restored)).toBe(wireBytes(solo.req));

    // The ONE deliberate difference, stated in both directions so neither default can drift unnoticed.
    expect(soloFraming).toContain("You are Aria in an immersive");
    expect(narratorFraming).toContain("You are the narrator of an immersive");
    expect(narratorFraming).not.toContain("perspective only");

    // Non-vacuous: the single-character card actually rendered, and neither single-character fence fired.
    expect(narrator.req.prompt.static).toContain("a bold knight");
    expect(historyText(narrator.req)).not.toContain("Continue the scene, voicing the present characters");
    expect(narrator.req.prompt.static).not.toContain("[Character — Aria]");
  });

  test("the persisted canon row is identical across postures (role/author/content)", async () => {
    const solo = await makePosture(DEFAULT_GROUP_CONFIG);
    const grouped = await makePosture(GROUP_OF_ONE);

    expect(solo.newRow).toEqual({ role: "assistant", characterId: ARIA, content: "reply" });
    expect(grouped.newRow).toEqual(solo.newRow);
  });
});
