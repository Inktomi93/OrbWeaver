// PD-116 gate 7 — the D16 SOLO-BYTE-IDENTICAL property suite (cross-cutting, mirror-exempt).
// D16: solo is not a mode — a solo chat IS a group of one, and the group machinery must be a
// structural NO-OP at cast=1 (no `if (isGroup)` anywhere — the active no-if-is-group grit is the
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

// The ctx MUST carry a real `cast`/`castMembers` or this whole suite is vacuous for the card-shape
// (`shapeContextForSpeaker` returns the ctx UNTOUCHED when either is absent, so every posture would take
// the same early return and the arms under test would never run). A roster of ONE is the D16 subject.
const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  cast: [{ name: "Aria", description: "a bold knight" }],
  castMembers: [{ kind: "character", characterId: ARIA }],
  recentMessages: [],
};

/** Posture B — a room that has ALL the group knobs a host can set, with one member. */
const GROUP_OF_ONE: GroupConfig = {
  ...DEFAULT_GROUP_CONFIG,
  output: "per-speaker",
  speakerTags: true,
  cardScope: "scoped",
};

/** Posture C — the NARRATOR arm at cast=1. Its round is authored by the synthetic group character and its
 *  card shape takes a different branch entirely (`{kind:"cast"}` speaker + whole-cast co-speakers), so it is
 *  the posture most able to break D16 — and the one the suite could not see before, because the shared ctx
 *  carried no cast at all. `speakerTags` rides ON (its narrator default) to pin the config-carrying room. */
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
    debitBudget: (): Promise<void> => Promise.resolve(),
    resolveTurnPolicy: async () => ({ budget: null, allowNonOwnerMaxProSub: false }),
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
      runAsUserId: HOST,
      kind: "auto",
      intent: {},
    },
    group,
    speakers: [{ ref: { kind: "character", characterId: ARIA }, name: "Aria" }],
    // A narrator round is authored by the synthetic group character (`roundSpeakers` THROWS on a null here);
    // every other posture ignores it. `castName` is the joined present cast, which at cast=1 IS "Aria" — the
    // same label the per-speaker postures stamp, which is exactly what makes the byte comparison meaningful.
    groupCharacterId: group.output === "narrator" ? GROUP_CHAR : null,
    castName: "Aria",
    // The nudge's own cast-of-one guard: `narratorMemberNames.length <= 1` ⇒ no narrator nudge at all, the
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

  test("the group knobs are runtime-fenced, not mode-fenced: no nudge, no name-stamp at cast=1", async () => {
    const { req } = await makePosture(GROUP_OF_ONE);

    // groupNudge is ON in the config — fenced by `multi` (speakers.length > 1), so it never renders.
    expect(historyText(req)).not.toContain("[Write the next reply only as");
    // The name-stamp is fenced by hasMultipleCharacters (distinct authors), not by the room's config —
    // one authoring character ⇒ no `Aria:` prefix anywhere in the delivered transcript.
    expect(historyText(req)).not.toContain("Aria:");
  });

  // The NARRATOR arm at cast=1. Added 2026-08-07 after a verifier found this suite VACUOUS for the card
  // shape: the shared ctx carried no `cast`/`castMembers`, so both postures took `shapeContextForSpeaker`'s
  // absent-cast early return and 3/3 green proved nothing about the arm. It now carries a real roster of one
  // and drives the branch that most plausibly breaks D16 — a whole-cast speaker arm and whole-cast card merge.
  test("the NARRATOR arm is byte-identical at cast=1 too (the whole-cast shape degrades to the solo one)", async () => {
    const solo = await makePosture(DEFAULT_GROUP_CONFIG);
    const narrator = await makePosture(NARRATOR_OF_ONE);

    // The headline, for the arm that has its own speaker shape: same wire product as the untouched solo room.
    expect(wireBytes(narrator.req)).toBe(wireBytes(solo.req));
    // Non-vacuous: the cast-of-one card actually rendered, and neither cast-of-one fence fired.
    expect(narrator.req.prompt.static).toContain("a bold knight");
    expect(historyText(narrator.req)).not.toContain("Continue the scene, voicing the present characters");
    expect(narrator.req.prompt.static).not.toContain("[Cast — Aria]");
  });

  test("the persisted canon row is identical across postures (role/author/content)", async () => {
    const solo = await makePosture(DEFAULT_GROUP_CONFIG);
    const grouped = await makePosture(GROUP_OF_ONE);

    expect(solo.newRow).toEqual({ role: "assistant", characterId: ARIA, content: "reply" });
    expect(grouped.newRow).toEqual(solo.newRow);
  });
});
