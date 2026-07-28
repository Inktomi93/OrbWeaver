// .int test for schema/rpg (the W0 6-table lite substrate floor, rpg-design/05 §4.2): the test-mirror (db
// enum === contracts tuple, no re-spell), a config/snapshot JSON round-trip, the mode/status/sheet-XOR/
// journal-type CHECK guards, the chat→game CASCADE authority chain (D23 — no ownerId), the variant→snapshot
// UNIQUE + CASCADE (the swipe-rewind key), the variant→journal CASCADE (dead-swipe entry cleanup), and the
// checkpoint→snapshot RESTRICT ("restore broken because the snapshot vanished" must be a constraint error).
// Real libSQL :memory: via freshDb (FK ON).

import type { RpgGameConfig, RpgQuest } from "@orb/contracts/rpg";
import {
  RPG_CHECKPOINT_TRIGGERS,
  RPG_GAME_MODES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RPG_PROFILE_FREEFORM,
  RPG_WIDGET_POSITIONS,
  RPG_WIDGET_TYPES,
} from "@orb/contracts/rpg";
import {
  characters,
  chats,
  isConstraintViolation,
  messages,
  messageVariants,
  rpgCheckpoints,
  rpgGames,
  rpgHudWidgets,
  rpgJournal,
  rpgSheets,
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
  RpgGameId,
  RpgJournalId,
  RpgQuestId,
  RpgSheetId,
  RpgSnapshotId,
  RpgWidgetId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// ── Test-mirror (D34): every rpg enum column derives the ONE contracts tuple ────────────────────────────
test("rpg enum columns mirror their contracts tuples (db derives, never re-spells)", () => {
  expect(rpgGames.mode.enumValues).toEqual([...RPG_GAME_MODES]);
  expect(rpgGames.status.enumValues).toEqual([...RPG_GAME_STATUSES]);
  expect(rpgJournal.type.enumValues).toEqual([...RPG_JOURNAL_TYPES]);
  expect(rpgCheckpoints.trigger.enumValues).toEqual([...RPG_CHECKPOINT_TRIGGERS]);
  expect(rpgHudWidgets.type.enumValues).toEqual([...RPG_WIDGET_TYPES]);
  expect(rpgHudWidgets.position.enumValues).toEqual([...RPG_WIDGET_POSITIONS]);
});

// `isConstraintViolation` returns `ConstraintViolation | undefined`; `toSatisfy` needs a boolean predicate.
const isConstraint = (e: unknown): boolean => isConstraintViolation(e) !== undefined;

const CONFIG: RpgGameConfig = {
  engaged: true,
  statProfile: RPG_PROFILE_FREEFORM,
  lite: { steeringNote: "" },
  extractionMode: "reliable",
  features: {
    castFields: [],
    relationshipHints: {},
    deception: false,
    omniscience: false,
    hiddenContentReveal: true,
    recentBeatsKeepLast: 8,
    pinnedOrbs: [],
    immersiveHtml: true,
    immersiveHtmlInteractive: true,
    cardKeepLastX: 0,
    cyoa: false,
    cyoaChoiceBehavior: "compose",
    plotProgression: true,
  },
  userMacros: [],
};
const EMPTY_SHEET = { className: "", attributes: {}, poolDefs: [], maxHp: null, flavor: "", level: null };
const CUSTOM_BINDING = { source: "custom", subjectName: null } as const;

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
  await db.insert(characters).values({ id: characterId, handle: "card-sheet", ownerId, contentHash: "hash", name: "Card" });
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

test("rpg_hud_widgets binding JSON round-trips + type/position CHECK", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_widget");
  const gameId = castId<RpgGameId>("rpg_game_widget");
  await seedGame(db, chatId, gameId);
  const widgetId = castId<RpgWidgetId>("rpg_widget_1");
  await db.insert(rpgHudWidgets).values({ id: widgetId, gameId, type: "meter", label: "Corruption", position: "banner", binding: CUSTOM_BINDING });
  const [w] = await db.select().from(rpgHudWidgets).where(eq(rpgHudWidgets.id, widgetId));
  expect(w?.binding).toEqual(CUSTOM_BINDING);
  const bad = { id: castId<RpgWidgetId>("rpg_widget_bad"), gameId, type: "dial" as "meter", label: "x", position: "banner" as const, binding: CUSTOM_BINDING };
  await expect(db.insert(rpgHudWidgets).values(bad)).rejects.toSatisfy(isConstraint);
});
