// .int test for schema/rpg (the W0 6-table lite substrate floor, docs/plans/rpg/design.md): the test-mirror (db
// enum === contracts tuple, no re-spell), a config/snapshot JSON round-trip, the mode/status/sheet-XOR/
// journal-type CHECK guards, the chat→game CASCADE authority chain (D23 — no ownerId), the variant→snapshot
// UNIQUE + CASCADE (the swipe-rewind key), the variant→journal CASCADE (dead-swipe entry cleanup), and the
// checkpoint→snapshot RESTRICT ("restore broken because the snapshot vanished" must be a constraint error).
// Real libSQL :memory: via freshDb (FK ON).

import type { RpgGameConfig, RpgQuest } from "@orb/contracts/rpg";
import { RPG_CHECKPOINT_TRIGGERS, RPG_GAME_MODES, RPG_GAME_STATUSES, RPG_JOURNAL_TYPES, RPG_PROFILE_FREEFORM } from "@orb/contracts/rpg";
import { characters, chats, messages, messageVariants, rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type {
  CharacterHandle,
  CharacterId,
  ChatId,
  Handle,
  MessageId,
  MessageVariantId,
  RpgCheckpointId,
  RpgGameId,
  RpgJournalId,
  RpgQuestId,
  RpgSheetId,
  RpgSnapshotId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

// ── Test-mirror (D34): every rpg enum column derives the ONE contracts tuple ────────────────────────────
test("rpg enum columns mirror their contracts tuples (db derives, never re-spells)", () => {
  expect(rpgGames.mode.enumValues).toEqual([...RPG_GAME_MODES]);
  expect(rpgGames.status.enumValues).toEqual([...RPG_GAME_STATUSES]);
  expect(rpgJournal.type.enumValues).toEqual([...RPG_JOURNAL_TYPES]);
  expect(rpgCheckpoints.trigger.enumValues).toEqual([...RPG_CHECKPOINT_TRIGGERS]);
});

// `isConstraintViolation` returns `ConstraintViolation | undefined`; `toSatisfy` needs a boolean predicate.
const isConstraint = (e: unknown): boolean => isConstraintViolation(e) !== undefined;

const CONFIG: RpgGameConfig = {
  engaged: true,
  ruleset: "freeform",
  dateMode: "narrated",
  statProfile: RPG_PROFILE_FREEFORM,
  lite: { steeringNote: "" },
  extractionMode: "folded",
  extractionContext: "window",
  extractionWindowTokens: 4096,
  reconcileEveryBeats: 10,
  trackers: [],
  features: {
    relationshipHints: {},
    journalTypeHints: {},
    deception: false,
    omniscience: false,
    hiddenContentReveal: true,
    recentBeatsKeepLast: 8,
    immersiveHtml: true,
    immersiveHtmlInteractive: true,
    cardKeepLastX: 0,
    cyoa: false,
    cyoaChoiceBehavior: "compose",
    plotProgression: true,
  },
  userMacros: [],
};
const EMPTY_SHEET = { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] };

async function seedGame(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, gameId: RpgGameId): Promise<void> {
  await db.insert(chats).values({ id: chatId });
  await db.insert(rpgGames).values({ id: gameId, chatId, mode: "lite", status: "active", config: CONFIG });
}

async function seedVariant(db: Awaited<ReturnType<typeof freshDb>>, chatId: ChatId, messageId: MessageId, variantId: MessageVariantId): Promise<void> {
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "assistant" });
  await db.insert(messageVariants).values({ id: variantId, messageId, idx: 0, content: "a take" });
}

test("rpg_games insert→select round-trips (config JSON, gmUserId/gmPresetId born null)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_g");
  const gameId = castId<RpgGameId>("rpg_game_1");
  await seedGame(db, chatId, gameId);
  const [row] = await db.select().from(rpgGames).where(eq(rpgGames.id, gameId));
  expect(row?.mode).toBe("lite");
  expect(row?.status).toBe("active");
  expect(row?.config).toEqual(CONFIG);
  expect(row?.gmUserId).toBeNull();
  expect(row?.gmPresetId).toBeNull();
  expect(row?.sessionNumber).toBe(1);
});

test("rpg_games CHECK rejects a bad mode and a bad status", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_bad");
  await db.insert(chats).values({ id: chatId });
  const badMode = { id: castId<RpgGameId>("rpg_game_bad_mode"), chatId, mode: "guided" as "lite", status: "active" as const, config: CONFIG };
  const badStatus = { id: castId<RpgGameId>("rpg_game_bad_status"), chatId, mode: "lite" as const, status: "playing" as "active", config: CONFIG };
  await expect(db.insert(rpgGames).values(badMode)).rejects.toSatisfy(isConstraint);
  await expect(db.insert(rpgGames).values(badStatus)).rejects.toSatisfy(isConstraint);
});

test("rpg_games chat FK is UNIQUE (one game per chat) and CASCADEs on chat delete (D23 authority chain)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_uniq");
  const gameId = castId<RpgGameId>("rpg_game_uniq");
  await seedGame(db, chatId, gameId);
  // A second game on the same chat violates the UNIQUE index.
  const dup = { id: castId<RpgGameId>("rpg_game_dup"), chatId, mode: "lite" as const, status: "active" as const, config: CONFIG };
  await expect(db.insert(rpgGames).values(dup)).rejects.toSatisfy(isConstraint);
  // Deleting the chat CASCADEs the game away (the FK chain IS the authority, no ownerId).
  await db.delete(chats).where(eq(chats.id, chatId));
  expect(await db.select().from(rpgGames).where(eq(rpgGames.id, gameId))).toHaveLength(0);
});

test("rpg_snapshots is variant-keyed UNIQUE + CASCADEs on variant delete (the swipe-rewind mechanism)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_snap");
  const gameId = castId<RpgGameId>("rpg_game_snap");
  await seedGame(db, chatId, gameId);
  const messageId = castId<MessageId>("message_snap");
  const variantId = castId<MessageVariantId>("message_variant_snap");
  await seedVariant(db, chatId, messageId, variantId);
  const quests: RpgQuest[] = [{ id: castId<RpgQuestId>("q1"), name: "Escape", status: "active", description: "", objectives: [] }];
  const snapshotId = castId<RpgSnapshotId>("rpg_snapshot_1");
  await db.insert(rpgSnapshots).values({ id: snapshotId, gameId, messageId, variantId, quests, committed: 1 });
  const [snap] = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, snapshotId));
  expect(snap?.quests).toEqual(quests); // quests fold INTO the snapshot (§2.5)
  expect(snap?.clock).toBeNull(); // ambient born null (§2.7)
  // A second snapshot on the same variant violates the UNIQUE index.
  const dup = { id: castId<RpgSnapshotId>("rpg_snapshot_dup"), gameId, messageId, variantId };
  await expect(db.insert(rpgSnapshots).values(dup)).rejects.toSatisfy(isConstraint);
  // Deleting the variant (a swipe delete) CASCADEs its snapshot — the swipe's state dies with it.
  await db.delete(messageVariants).where(eq(messageVariants.id, variantId));
  expect(await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, snapshotId))).toHaveLength(0);
});

test("rpg_sheets enforces the character XOR user actor CHECK (neither set AND both set reject)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_sheet");
  const gameId = castId<RpgGameId>("rpg_game_sheet");
  await seedGame(db, chatId, gameId);
  // Neither actor id set → XOR CHECK rejects.
  const noActor = { id: castId<RpgSheetId>("rpg_sheet_none"), gameId, sheet: EMPTY_SHEET };
  await expect(db.insert(rpgSheets).values(noActor)).rejects.toSatisfy(isConstraint);
  // BOTH set (with real FK targets, so the CHECK — not a dangling FK — is what rejects).
  const ownerId = castId<UserId>("user_sheet_owner");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("sheet_owner") });
  const characterId = castId<CharacterId>("character_sheet");
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>("card-sheet"), ownerId, contentHash: "hash", name: "Card" });
  const bothSet = { id: castId<RpgSheetId>("rpg_sheet_both"), gameId, characterId, userId: ownerId, sheet: EMPTY_SHEET };
  await expect(db.insert(rpgSheets).values(bothSet)).rejects.toSatisfy(isConstraint);
  // Exactly one set → accepted (the sanctioned shape).
  const oneSet = { id: castId<RpgSheetId>("rpg_sheet_one"), gameId, userId: ownerId, sheet: EMPTY_SHEET };
  await db.insert(rpgSheets).values(oneSet);
  expect(await db.select().from(rpgSheets).where(eq(rpgSheets.gameId, gameId))).toHaveLength(1);
});

test("rpg_journal type CHECK guards + variant CASCADE (dead-swipe entries are cleaned up)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_journal");
  const gameId = castId<RpgGameId>("rpg_game_journal");
  await seedGame(db, chatId, gameId);
  const messageId = castId<MessageId>("message_j");
  const variantId = castId<MessageVariantId>("message_variant_j");
  await seedVariant(db, chatId, messageId, variantId);
  // A hand entry stamps variantId NULL (every lineage); a model entry stamps the producing variant.
  const hand = { id: castId<RpgJournalId>("rpg_journal_hand"), gameId, type: "note" as const, title: "hand", content: "room note", variantId: null };
  await db.insert(rpgJournal).values(hand);
  const modelEntry = castId<RpgJournalId>("rpg_journal_model");
  await db.insert(rpgJournal).values({ id: modelEntry, gameId, type: "event", title: "model", content: "a beat", variantId });
  const bad = { id: castId<RpgJournalId>("rpg_journal_bad"), gameId, type: "prophecy" as "note", title: "x", content: "y" };
  await expect(db.insert(rpgJournal).values(bad)).rejects.toSatisfy(isConstraint);
  // Deleting the variant CASCADEs the model entry (leak-free) but NOT the hand entry.
  await db.delete(messageVariants).where(eq(messageVariants.id, variantId));
  expect(await db.select().from(rpgJournal).where(eq(rpgJournal.id, modelEntry))).toHaveLength(0);
  expect(await db.select().from(rpgJournal).where(eq(rpgJournal.gameId, gameId))).toHaveLength(1);
});

test("rpg_checkpoints RESTRICTs a snapshot delete (restore must not break silently)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_cp");
  const gameId = castId<RpgGameId>("rpg_game_cp");
  await seedGame(db, chatId, gameId);
  const messageId = castId<MessageId>("message_cp");
  const variantId = castId<MessageVariantId>("message_variant_cp");
  await seedVariant(db, chatId, messageId, variantId);
  const snapshotId = castId<RpgSnapshotId>("rpg_snapshot_cp");
  await db.insert(rpgSnapshots).values({ id: snapshotId, gameId, messageId, variantId, committed: 1 });
  const cp = { id: castId<RpgCheckpointId>("rpg_checkpoint_1"), gameId, snapshotId, label: "before the boss", trigger: "manual" as const };
  await db.insert(rpgCheckpoints).values(cp);
  // Deleting the checkpointed snapshot directly is blocked by RESTRICT.
  await expect(db.delete(rpgSnapshots).where(eq(rpgSnapshots.id, snapshotId))).rejects.toSatisfy(isConstraint);
});

test("R4c: a `custom` journal entry stores its free label; the type CHECK still walls off an invented type", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_r4c");
  const gameId = castId<RpgGameId>("rpg_game_r4c");
  await seedGame(db, chatId, gameId);
  const entryId = castId<RpgJournalId>("rpg_journal_custom");
  await db.insert(rpgJournal).values({ id: entryId, gameId, type: "custom", label: "ritual", title: "The Binding", content: "Salt and a name." });
  const [row] = await db.select().from(rpgJournal).where(eq(rpgJournal.id, entryId));
  expect(row?.type).toBe("custom");
  expect(row?.label).toBe("ritual");
  // A built-in type stores the born-default empty label (the gloss is meaningful only on `custom`).
  const plainId = castId<RpgJournalId>("rpg_journal_plain");
  await db.insert(rpgJournal).values({ id: plainId, gameId, type: "event", title: "A brawl", content: "It went badly." });
  expect((await db.select().from(rpgJournal).where(eq(rpgJournal.id, plainId)))[0]?.label).toBe("");
  // The enum stays CLOSED — `custom` + label is the escape, never an off-vocab token.
  const bad = { id: castId<RpgJournalId>("rpg_journal_bad"), gameId, type: "ritual" as "note", title: "x", content: "y" };
  await expect(db.insert(rpgJournal).values(bad)).rejects.toSatisfy(isConstraint);
});
