// THE PROMPT-BUILD HISTORY LEG AT ITS REAL SEAM (`assembly/shape.ts::toShapeCanon`), against a real
// `AssembleContext`, the real `regexScriptSchema` rows and the REAL node:vm watchdog.
//
// WHAT THIS FILE IS FOR: the ephemerality proof-set. The leg's whole claim is that it changes the bytes the
// MODEL reads and nothing else, so the pins here are (a) the wire copy IS transformed, (b) the persisted
// canon is byte-identical afterwards, and (c) the order — D121-E's "macros resolve BEFORE regex on a leg"
// — is real at this seam and not just in a file header.
//
// THE PERSISTED PLANES, and why ONE assertion covers the four the ruling names. Canon content lives on
// `message_variants.content` (D26 — `messages` is a pure slot), and EVERY persisted plane reads it from
// there: the compaction digest summarises `loadCanonHistory` output (`persistence/queries.ts`), an export
// selects `messageVariants` directly (`domain/export/verbs/export-chat.ts`), and a fork deep-copies those
// same rows (`domain/chat/verbs/fork.ts`). The leg holds no `Db` and its output is consumed only by SHAPE,
// so the only way it could ever reach any of them is by mutating the rows it was handed — which the unit
// file pins it does not, and which this file confirms against the database after a real build.

import type { CharacterCard } from "@orb/contracts/character";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { HISTORY_DEPTH_PLACEMENT } from "@orb/kit/regex";
import { createRegexApplyReplace } from "@orb/server/kit/regex";
import { asc } from "drizzle-orm";
import { beforeEach } from "vitest";
import { buildAssembleContext } from "../../../../../packages/server/src/domain/chat/assembly/context.ts";
import { buildTurnMacroContext } from "../../../../../packages/server/src/domain/chat/assembly/macros.ts";
import { toShapeCanon } from "../../../../../packages/server/src/domain/chat/assembly/shape.ts";
import type { PromptHistoryRegexEnv } from "../../../../../packages/server/src/domain/chat/contract/regex.ts";
import type { HistoryMacroNames } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const CARD: CharacterCard = {
  name: "Aria",
  description: "Aria the knight",
  personality: null,
  scenario: null,
  greetings: [],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
  creatorNotes: null,
  creator: null,
  cardVersion: null,
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  regexScripts: [],
  extensions: null,
  residualData: null,
  avatarAssetId: null,
  refinery: null,
};

/** No per-row stamps in these fixtures — `{{char}}` then resolves through the ctx cast, which is what the
 *  ORDER pin below exercises. */
const NO_MACRO_NAMES: HistoryMacroNames = {
  characterNamesById: new Map<CharacterId, RowCharacterName>(),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

/** A host-tier library row on the ephemeral leg, through the real parse seam (so the depth pairing the
 *  contract enforces is exercised, not bypassed). */
function historyScript(args: { find: string; replace: string; min?: number; max?: number | null }): RegexScriptRow {
  return regexScriptSchema.parse({
    id: mintTypeId(ID_PREFIX.regexScript),
    name: "history leg",
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: args.find,
    replaceString: args.replace,
    placement: [HISTORY_DEPTH_PLACEMENT],
    historyDepth: { min: args.min ?? 0, max: args.max ?? null },
  });
}

/** Seed a chat with `bodies` as canon (oldest first) and return everything a build needs. */
async function seedRoom(bodies: readonly string[]): Promise<{ host: UserId; chatId: ChatId; charId: CharacterId }> {
  const host = await seedUser(db, castId<Handle>("host"));
  const chatId = await seedChat(db, "a");
  const charId = await seedCharacter(db, host, "aria");
  // Seeded in parallel deliberately: every row's id and `seq` are derived from its index, so canon order is
  // decided by the data, never by insert order (and the loop-await lint has nothing to complain about).
  await Promise.all(bodies.map((content, index) => seedMessage(db, chatId, index + 1, { role: index % 2 === 0 ? "user" : "assistant", content })));
  return { host, chatId, charId };
}

/** Run the REAL seam: build the assemble ctx with the given host-tier scripts, then map canon → wire rows
 *  through `toShapeCanon` with the `PROMPT_HISTORY` env a turn supplies. Returns the wire bodies. */
async function shapedBodies(room: { host: UserId; chatId: ChatId; charId: CharacterId }, scripts: readonly RegexScriptRow[]): Promise<string[]> {
  const ctx = makeChatContext(db, {
    getCard: () => Promise.resolve(CARD),
    // The REAL watchdog — the same injection `entry/compose/chat.ts` wires.
    applyRegexReplace: createRegexApplyReplace(),
  });
  const assembleContext = await buildAssembleContext(ctx, {
    chatId: room.chatId,
    ownerId: room.host,
    castCharacterIds: [room.charId],
    personaIds: [],
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    recentMessages: [],
    userInjections: [],
    variableValues: {},
    model: "test-model",
    injectionTokenBudget: 0,
    hostTierRegexScripts: scripts,
  });
  const env: PromptHistoryRegexEnv | null =
    scripts.length === 0
      ? null
      : {
          scripts: assembleContext.hostTierRegexScripts ?? [],
          macroCtx: buildTurnMacroContext({ assembleCtx: assembleContext, model: "test-model", chatId: room.chatId }),
          applyReplace: ctx.applyRegexReplace,
          onScriptFailure: (): void => undefined,
        };
  const canon = await loadCanonHistory(db, room.chatId);
  return toShapeCanon(canon, assembleContext, NO_MACRO_NAMES, env).map((row) => row.content);
}

/** The persisted canon, straight off `message_variants` — the row every persisted plane reads. */
async function storedBodies(): Promise<string[]> {
  const rows = await db.select({ content: messageVariants.content }).from(messageVariants).orderBy(asc(messageVariants.id));
  return rows.map((r) => r.content).sort();
}

test("EPHEMERALITY: the leg rewrites the wire history and leaves every stored row byte-identical", async () => {
  const room = await seedRoom(["plan <ooc>the twist is a betrayal</ooc> ahead", "understood", "keep going"]);
  const before = await storedBodies();

  const wire = await shapedBodies(room, [historyScript({ find: "<ooc>[\\s\\S]*?</ooc>", replace: "" })]);

  // The model no longer reads the aside…
  expect(wire[0]).toBe("plan  ahead");
  expect(wire.join("|")).not.toContain("betrayal");
  // …and the transcript still says exactly what it said. This is the plane a digest, an export and a fork
  // all read (see the header) — nothing about the build touched it.
  expect(await storedBodies()).toEqual(before);
  expect((await storedBodies()).join("|")).toContain("the twist is a betrayal");
  // The read every one of those planes goes through returns the ORIGINAL text, not the shaped copy.
  const canon = await loadCanonHistory(db, room.chatId);
  expect(canon[0]?.content).toContain("<ooc>the twist is a betrayal</ooc>");
});

test("DEPTH: a {min:0,max:0} script reaches the newest message only, over real canon", async () => {
  const room = await seedRoom(["one secret", "two secret", "three secret"]);
  const wire = await shapedBodies(room, [historyScript({ find: "secret", replace: "[cut]", min: 0, max: 0 })]);
  expect(wire).toEqual(["one secret", "two secret", "three [cut]"]);
  expect(await storedBodies()).toEqual(["one secret", "three secret", "two secret"]);
});

test("DEPTH: a floor reaches only the older messages", async () => {
  const room = await seedRoom(["one secret", "two secret", "three secret"]);
  const wire = await shapedBodies(room, [historyScript({ find: "secret", replace: "[cut]", min: 1 })]);
  expect(wire).toEqual(["one [cut]", "two [cut]", "three secret"]);
});

// D121-E's ORDER CLAUSE at this leg's seam: the row's own macros are resolved by `toShapeCanon` FIRST, so a
// pattern matching the RESOLVED text bites. If regex ran first it would see the raw `{{char}}` token and
// this would not match at all — which is exactly the drift a header comment cannot prevent.
test("ORDER: the row's macros resolve BEFORE the leg runs (macro → PROMPT_HISTORY regex)", async () => {
  const room = await seedRoom(["{{char}} draws her sword"]);
  const wire = await shapedBodies(room, [historyScript({ find: "Aria draws", replace: "Aria sheathes" })]);
  expect(wire).toEqual(["Aria sheathes her sword"]);
  // The stored row keeps the unresolved token — macro resolution is a read-time pass, and so is this leg.
  expect(await storedBodies()).toEqual(["{{char}} draws her sword"]);
});

test("a chat with no host-tier scripts shapes byte-identically (the leg is free when unused)", async () => {
  const room = await seedRoom(["one", "two"]);
  expect(await shapedBodies(room, [])).toEqual(["one", "two"]);
});

test("a script on another leg never fires here — the persist-time legs and this one do not overlap", async () => {
  const room = await seedRoom(["one secret"]);
  const sendOnly = regexScriptSchema.parse({
    id: mintTypeId(ID_PREFIX.regexScript),
    name: "send leg",
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: "secret",
    replaceString: "[cut]",
    placement: ["USER_INPUT"],
  });
  expect(await shapedBodies(room, [sendOnly])).toEqual(["one secret"]);
});

test("a hidden row stays out of the leg's reach — depth counts the rows that actually ride", async () => {
  const host = await seedUser(db, castId<Handle>("host"));
  const chatId = castId<ChatId>("chat_a");
  await seedChat(db, "a");
  const charId = await seedCharacter(db, host, "aria");
  await seedMessage(db, chatId, 1, { role: "user", content: "one secret" });
  await seedMessage(db, chatId, 2, { role: "assistant", content: "two secret", excludedFromPrompt: true });
  await seedMessage(db, chatId, 3, { role: "user", content: "three secret" });

  // Two rows ride; depth 0 is "three", depth 1 is "one" — the excluded row occupies no depth slot.
  const wire = await shapedBodies({ host, chatId, charId }, [historyScript({ find: "secret", replace: "[cut]", min: 1, max: 1 })]);
  expect(wire).toEqual(["one [cut]", "three secret"]);
});
