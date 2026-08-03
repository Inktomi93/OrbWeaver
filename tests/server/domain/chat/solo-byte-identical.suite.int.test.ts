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

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

/** Posture B — a room that has ALL the group knobs a host can set, with one member. */
const GROUP_OF_ONE: GroupConfig = {
  ...DEFAULT_GROUP_CONFIG,
  output: "per-speaker",
  speakerTags: true,
  cardScope: "scoped",
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
    groupCharacterId: null,
    castName: "Aria",
    narratorMemberNames: [],
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

  test("the persisted canon row is identical across postures (role/author/content)", async () => {
    const solo = await makePosture(DEFAULT_GROUP_CONFIG);
    const grouped = await makePosture(GROUP_OF_ONE);

    expect(solo.newRow).toEqual({ role: "assistant", characterId: ARIA, content: "reply" });
    expect(grouped.newRow).toEqual(solo.newRow);
  });
});
