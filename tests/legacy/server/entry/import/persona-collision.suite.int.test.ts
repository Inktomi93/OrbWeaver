// The persona wave and the chat wave over a REAL db, run the way the profile import runs them: personas
// first (their `idByName` fills `personaByUserName`), then the chats attributing their user turns against it.
// The owner's own case: an orb "Nate" already exists, the ST profile carries a DIFFERENT "Nate", and the
// per-collision choice decides whether the chats land on the existing persona or on a numbered copy.

import type { PersonaCollisionChoices } from "@orb/contracts/import";
import type { Db } from "@orb/db";
import { chats, messages, personas } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatParticipantId,
  ChatTurnId,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedCharacter, seedPersona, seedUser } from "@orb/testkit/node/factories/index.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { asc, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { ChatImportContext } from "#server/domain/chat/contract/import.ts";
import { createBulkImportChats } from "#server/domain/chat/persistence/import-write.ts";
import type { ImportContext } from "#server/domain/import/context.ts";
import { createImportChats } from "#server/domain/import/verbs/import-chats.ts";
import { createImportPersonas } from "#server/domain/import/verbs/import-personas.ts";
import { createBulkImportPersonas } from "#server/domain/persona/persistence/import-write.ts";
import { bumpStatsCanonVersion } from "#server/domain/stats/write/apply-delta.ts";
import { parseChatJsonl } from "#server/primitives/serde/chat/index.ts";

const NOW = 1_700_000_000_000;
const CHARACTER_NAME = "Eleni Northwell";
const FILENAME = "Eleni Northwell - 2024-3-6 @14h 23m 45s 123ms.jsonl";
const ORB_NATE = "Nate, as written in Orbweaver";
const ST_NATE = "Nate, as written in SillyTavern";

function chatImportCtx(db: Db): ChatImportContext {
  let n = 0;
  const turnIds = createSeededIds();
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    bumpStatsCanonVersion,
    now: (): number => NOW,
    newChatId: (): ChatId => castId<ChatId>(`chat_${counter()}`),
    newChatTurnId: (): ChatTurnId => castId<ChatTurnId>(turnIds.next(ID_PREFIX.chatTurn)),
    newMessageId: (): MessageId => castId<MessageId>(`message_${counter()}`),
    newMessageVariantId: (): MessageVariantId => castId<MessageVariantId>(`message_variant_${counter()}`),
    newMessageAssetId: (): MessageAssetId => castId<MessageAssetId>(`message_asset_${counter()}`),
    newParticipantId: (): ChatParticipantId => castId<ChatParticipantId>(`chat_participant_${counter()}`),
    newChatInjectionId: (): ChatInjectionId => castId<ChatInjectionId>(`chat_injection_${counter()}`),
    filterExistingAssetIds: (): Promise<readonly AssetId[]> => Promise.resolve([]),
    mintSyntheticGroupCharacter: (): Promise<{ characterId: CharacterId }> => {
      throw new Error("persona-collision: no narrator slot in these fixtures");
    },
  };
}

/** The profile run's `ImportContext` over the REAL persona and chat write ops. */
function runContext(db: Db, ownerId: UserId): ImportContext {
  const inert = (): never => {
    throw new Error("persona-collision: card op not wired");
  };
  return {
    ownerId,
    createCharacter: inert,
    findByImportHash: inert,
    findByHandle: inert,
    findByName: inert,
    storeAsset: inert,
    attachImportedArt: inert,
    attachCardTag: inert,
    profile: {
      now: (): number => NOW,
      personaByUserName: new Map(),
      bulkImportChats: createBulkImportChats(chatImportCtx(db)),
      bulkImportPersonas: createBulkImportPersonas({
        db,
        now: (): number => NOW,
        newPersonaId: (): PersonaId => mintTypeId(ID_PREFIX.persona),
      }),
      enqueueImportIndex: (): Promise<void> => Promise.resolve(),
      reconcileStats: (): Promise<void> => Promise.resolve(),
    },
  };
}

/** A chat written by the ST persona "Nate": the header's `user_name` and the user turn's own stamp both say so. */
function nateChat(): string {
  // Raw JSON lines: the ST wire keys are snake_case and stay verbatim.
  return [
    `{"user_name":"Nate","character_name":"${CHARACTER_NAME}","create_date":"2024-3-6 @14h 23m 45s 123ms","chat_metadata":{}}`,
    `{"is_user":false,"name":"${CHARACTER_NAME}","mes":"Hello traveller.","send_date":"Mar 6, 2024 10:52pm"}`,
    `{"is_user":true,"name":"Nate","mes":"Hi Eleni!","send_date":"Mar 6, 2024 10:53pm"}`,
    "",
  ].join("\n");
}

async function seedOwnerWithOrbNate(): Promise<{ db: Db; ownerId: UserId; characterId: CharacterId; orbNate: PersonaId }> {
  const db = await freshDb();
  const owner = await seedUser(db, {});
  const character = await seedCharacter(db, { ownerId: owner.id, name: CHARACTER_NAME });
  const orbNate = await seedPersona(db, { ownerId: owner.id, name: "Nate", description: ORB_NATE });
  return { db, ownerId: owner.id, characterId: character.id, orbNate: orbNate.id };
}

/** Persona wave, then chat wave — the order `runProfileDirImport` guarantees. */
async function runProfile(args: { db: Db; ownerId: UserId; characterId: CharacterId; collisions?: PersonaCollisionChoices }): Promise<void> {
  const { db, ownerId, characterId, collisions } = args;
  const ctx = runContext(db, ownerId);
  await createImportPersonas(ctx)({
    personas: [{ parsed: { name: "Nate", description: ST_NATE, avatarFile: "nate.png", isDefault: false, metadata: null } }],
    ...(collisions === undefined ? {} : { collisions }),
  });
  const parsed = parseChatJsonl(nateChat(), { fileName: FILENAME, charDirName: CHARACTER_NAME });
  if (parsed === null) {
    throw new Error("fixture parse failed");
  }
  await createImportChats(ctx)({ characterId, chats: [{ parsed, importedFrom: FILENAME, importHash: "hash-nate-chat" }] });
}

describe("profile import — a same-named, different-content persona", () => {
  test("merge: the chat lands on the existing persona, no copy is made, its content is untouched", async () => {
    const { db, ownerId, characterId, orbNate } = await seedOwnerWithOrbNate();

    await runProfile({ db, ownerId, characterId, collisions: { nate: "merge" } });

    const rows = await db
      .select({ id: personas.id, name: personas.name, description: personas.description })
      .from(personas)
      .where(eq(personas.ownerId, ownerId));
    expect(rows).toEqual([{ id: orbNate, name: "Nate", description: ORB_NATE }]);
    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(orbNate);
    const userTurns = await db.select({ role: messages.role, personaId: messages.personaId }).from(messages).orderBy(asc(messages.seq));
    expect(userTurns.filter((m) => m.role === "user").map((m) => m.personaId)).toEqual([orbNate]);
  });

  test("an unlisted collision merges: the default is never a silent split", async () => {
    const { db, ownerId, characterId, orbNate } = await seedOwnerWithOrbNate();

    await runProfile({ db, ownerId, characterId });

    expect(await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, ownerId))).toEqual([{ name: "Nate" }]);
    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(orbNate);
  });

  test("keep-both: the profile's Nate lands as 'Nate 2' and the chat links to that copy", async () => {
    const { db, ownerId, characterId, orbNate } = await seedOwnerWithOrbNate();

    await runProfile({ db, ownerId, characterId, collisions: { nate: "keep-both" } });

    const rows = await db
      .select({ id: personas.id, name: personas.name, description: personas.description })
      .from(personas)
      .where(eq(personas.ownerId, ownerId));
    const copy = rows.find((r) => r.name === "Nate 2");
    expect(copy?.description).toBe(ST_NATE);
    expect(rows.find((r) => r.id === orbNate)?.description).toBe(ORB_NATE);
    expect((await db.select().from(chats))[0]?.anchorPersonaId).toBe(copy?.id);
    const userTurns = await db.select({ role: messages.role, personaId: messages.personaId }).from(messages).orderBy(asc(messages.seq));
    expect(userTurns.filter((m) => m.role === "user").map((m) => m.personaId)).toEqual([copy?.id]);
  });
});
