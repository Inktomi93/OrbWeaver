// .int tests for schema/rpg (D58 — the R1-subset baseline rider). Real libSQL :memory: via freshDb (FK
// PRAGMA ON). Covers the load-bearing DDL guarantees: chat delete CASCADEs the whole game; rpg_party's
// XOR(characterId,userId) + per-actor uniques; rpg_checkpoints RESTRICT on the pointed snapshot; the
// partial-unique locks (one `active` encounter per game; one `pending` check per target);
// unique(gameId,sessionNumber); the numeric CHECKs (morale 0..100, dc 2..30); and the enum test-mirror.

import { RPG_GAME_STATUSES } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import {
  chats,
  isConstraintViolation,
  messages,
  messageVariants,
  rpgCheckpoints,
  rpgEncounters,
  rpgGames,
  rpgParty,
  rpgPendingChecks,
  rpgSessions,
  rpgSnapshots,
  users,
} from "@orb/db";
import type {
  CharacterId,
  ChatId,
  Handle,
  MessageId,
  MessageVariantId,
  RpgCheckpointId,
  RpgEncounterId,
  RpgGameId,
  RpgPartyMemberId,
  RpgPendingCheckId,
  RpgSessionId,
  RpgSnapshotId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// `.toSatisfy` needs a `=> boolean`; `isConstraintViolation` returns the violation|undefined, so wrap it.
function isConstraintErr(err: unknown): boolean {
  return isConstraintViolation(err) !== undefined;
}

// A minimal parsed-shape config blob (the schema column is JSON; the domain parses on read).
const MINIMAL_CONFIG = {
  genres: ["Fantasy"],
  setting: "A fantasy world",
  tones: ["Heroic"],
  difficulty: "normal",
  rating: "sfw",
  language: "English",
  playerGoals: "Have an adventure",
  additionalPreferences: "",
  gm: { kind: "standalone" },
  houseRules: {},
  assist: {},
  imagery: {},
  lorebook: {},
} as never;

async function seedGame(
  db: Db,
  chatSuffix: string,
): Promise<{ chatId: ChatId; gameId: RpgGameId }> {
  const chatId = castId<ChatId>(`chat_rpg_${chatSuffix}`);
  await db.insert(chats).values({ id: chatId });
  const gameId = castId<RpgGameId>(`rpggame_${chatSuffix}`);
  await db.insert(rpgGames).values({ id: gameId, chatId, config: MINIMAL_CONFIG });
  return { chatId, gameId };
}

async function seedSnapshot(db: Db, gameId: RpgGameId, suffix: string): Promise<RpgSnapshotId> {
  const chatId = (await db.select().from(rpgGames).where(eq(rpgGames.id, gameId)))[0]?.chatId;
  const messageId = castId<MessageId>(`message_rpg_${suffix}`);
  await db
    .insert(messages)
    .values({ id: messageId, chatId: chatId as ChatId, seq: 1, role: "assistant" });
  const variantId = castId<MessageVariantId>(`message_variant_rpg_${suffix}`);
  await db.insert(messageVariants).values({ id: variantId, messageId, idx: 0, content: "x" });
  const snapshotId = castId<RpgSnapshotId>(`rpgsnap_${suffix}`);
  await db.insert(rpgSnapshots).values({
    id: snapshotId,
    gameId,
    messageId,
    variantId,
    clock: { day: 1, hour: 8, minute: 0 } as never,
  });
  return snapshotId;
}

test("rpg_games.status enum mirrors RPG_GAME_STATUSES (derives, never re-spells)", () => {
  expect(rpgGames.status.enumValues).toEqual([...RPG_GAME_STATUSES]);
});

test("chat delete CASCADEs the whole game (rpg_games + its satellites)", async () => {
  const db = await freshDb();
  const { chatId, gameId } = await seedGame(db, "casc");
  await seedSnapshot(db, gameId, "casc1");

  await db.delete(chats).where(eq(chats.id, chatId));
  expect(await db.select().from(rpgGames).where(eq(rpgGames.id, gameId))).toHaveLength(0);
  expect(await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId))).toHaveLength(
    0,
  );
});

test("rpg_party XOR(characterId,userId) + per-actor uniques", async () => {
  const db = await freshDb();
  const { gameId } = await seedGame(db, "party");
  const userId = castId<UserId>("user_rpg_party");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("rpg-party") });
  const characterId = castId<CharacterId>("character_rpg_party");
  // A character seat (XOR satisfied).
  const sheet = { attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, maxHp: 10 };
  async function insertMember(id: string, extra: Record<string, unknown>): Promise<void> {
    await db.insert(rpgParty).values({
      id: castId<RpgPartyMemberId>(id),
      gameId,
      sheet: sheet as never,
      provenance: "setup",
      joinedSession: 1,
      ...extra,
    });
  }

  // Character insert needs a real character row (FK).
  const { characters } = await import("@orb/db");
  await db
    .insert(users)
    .values({ id: castId<UserId>("user_rpg_owner"), handle: castId<Handle>("o") });
  await db.insert(characters).values({
    id: characterId,
    handle: "card-rpg",
    ownerId: castId<UserId>("user_rpg_owner"),
    contentHash: "h",
    name: "C",
  });

  await expect(insertMember("rpgparty_char", { characterId })).resolves.toBeUndefined();
  // BOTH null → XOR violated.
  await expect(insertMember("rpgparty_none", {})).rejects.toSatisfy(isConstraintErr);
  // BOTH set → XOR violated.
  await expect(insertMember("rpgparty_both", { characterId, userId })).rejects.toSatisfy(
    isConstraintErr,
  );
  // A user seat (XOR satisfied).
  await expect(insertMember("rpgparty_user", { userId })).resolves.toBeUndefined();
  // Second character seat for the same (game, character) → unique collides.
  await expect(insertMember("rpgparty_dupe", { characterId })).rejects.toSatisfy(isConstraintErr);
});

test("rpg_checkpoints RESTRICT blocks deleting the pointed snapshot", async () => {
  const db = await freshDb();
  const { gameId } = await seedGame(db, "ckpt");
  const snapshotId = await seedSnapshot(db, gameId, "ckpt1");
  await db.insert(rpgCheckpoints).values({
    id: castId<RpgCheckpointId>("rpgcheck_1"),
    gameId,
    snapshotId,
    label: "save",
    trigger: "manual",
  });
  await expect(db.delete(rpgSnapshots).where(eq(rpgSnapshots.id, snapshotId))).rejects.toSatisfy(
    isConstraintErr,
  );
});

test("partial-unique: one `active` encounter per game; one `pending` check per target", async () => {
  const db = await freshDb();
  const { gameId } = await seedGame(db, "lock");
  async function mkEnc(id: string, status: "active" | "victory"): Promise<void> {
    await db.insert(rpgEncounters).values({
      id: castId<RpgEncounterId>(id),
      gameId,
      status,
      state: {} as never,
    });
  }
  await expect(mkEnc("rpgenc_a", "active")).resolves.toBeUndefined();
  // Second ACTIVE encounter → the partial-unique lock collides.
  await expect(mkEnc("rpgenc_b", "active")).rejects.toSatisfy(isConstraintErr);
  // A terminal encounter is NOT covered by the partial index → allowed.
  await expect(mkEnc("rpgenc_c", "victory")).resolves.toBeUndefined();

  // Pending-check target lock.
  const userId = castId<UserId>("user_rpg_lock");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("rpg-lock") });
  const partyId = castId<RpgPartyMemberId>("rpgparty_lock");
  await db.insert(rpgParty).values({
    id: partyId,
    gameId,
    userId,
    sheet: {
      attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      maxHp: 10,
    } as never,
    provenance: "setup",
    joinedSession: 1,
  });
  async function mkCheck(id: string): Promise<void> {
    await db.insert(rpgPendingChecks).values({
      id: castId<RpgPendingCheckId>(id),
      gameId,
      targetPartyMemberId: partyId,
      skill: "athletics",
      dc: 12,
      requestedBy: "gm-seat",
    });
  }
  await expect(mkCheck("rpgpend_a")).resolves.toBeUndefined();
  await expect(mkCheck("rpgpend_b")).rejects.toSatisfy(isConstraintErr);
});

test("numeric CHECKs: morale 0..100, dc 2..30, and unique(gameId,sessionNumber)", async () => {
  const db = await freshDb();
  const { chatId } = await seedGame(db, "num");
  // morale > 100 → CHECK.
  await expect(
    db.insert(rpgGames).values({
      id: castId<RpgGameId>("rpggame_bad_morale"),
      chatId: castId<ChatId>(`${chatId}2`),
      config: MINIMAL_CONFIG,
      morale: 101,
    }),
  ).rejects.toSatisfy(isConstraintErr);

  const { gameId } = await seedGame(db, "num2");
  await db.insert(rpgSessions).values({
    id: castId<RpgSessionId>("rpgsession_1"),
    gameId,
    sessionNumber: 1,
  });
  // Duplicate (gameId, sessionNumber) → unique collides.
  await expect(
    db.insert(rpgSessions).values({
      id: castId<RpgSessionId>("rpgsession_2"),
      gameId,
      sessionNumber: 1,
    }),
  ).rejects.toSatisfy(isConstraintErr);
});
