import type { Db } from "@orb/db";
import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, rpgTurnToolCalls } from "@orb/db";
import type { MessageVariantId, RpgGameId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq, inArray } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type RpgService = ServicesResult["services"]["rpg"];
export type RpgGameRow = typeof rpgGames.$inferSelect;
export type RpgJournalRow = typeof rpgJournal.$inferSelect;
export type RpgCheckpointRow = typeof rpgCheckpoints.$inferSelect;
type RpgSheetRow = typeof rpgSheets.$inferSelect;
export type RpgSnapshotRow = typeof rpgSnapshots.$inferSelect;
export type RpgTurnToolCallsRow = typeof rpgTurnToolCalls.$inferSelect;

export interface CapturedRpgRows {
  readonly sheets: readonly RpgSheetRow[];
  readonly snapshots: readonly RpgSnapshotRow[];
  readonly journal: readonly RpgJournalRow[];
}

/** Observe the actual game planes without supplying a head, sheet, lineage or journal rule. */
export async function captureRpgRows(db: Db, gameId: RpgGameId): Promise<CapturedRpgRows> {
  const [sheets, snapshots, journal] = await Promise.all([
    db.select().from(rpgSheets).where(eq(rpgSheets.gameId, gameId)).orderBy(rpgSheets.id),
    db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId)).orderBy(rpgSnapshots.id),
    db.select().from(rpgJournal).where(eq(rpgJournal.gameId, gameId)).orderBy(rpgJournal.id),
  ]);
  return { sheets, snapshots, journal };
}

/** Capture disclosures only for operation-returned variants; the RPG flush owns calls, verdicts and lineage. */
export async function captureRpgTurnToolCalls(db: Db, gameId: RpgGameId, variantIds: readonly MessageVariantId[]): Promise<readonly RpgTurnToolCallsRow[]> {
  if (variantIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(rpgTurnToolCalls)
    .where(and(eq(rpgTurnToolCalls.gameId, gameId), inArray(rpgTurnToolCalls.variantId, [...variantIds])))
    .orderBy(rpgTurnToolCalls.variantId);
}

/** Birth, ruleset/profile derivation and the opaque chat pointer remain production operations. */
export async function seedRpgGame(root: ServerProducerRoot, params: Parameters<RpgService["createGame"]>[0]): Promise<RpgGameRow> {
  const db = root.db;
  const createGame = root.services.rpg.createGame;
  const result = await createGame(params);
  const row = await db.select().from(rpgGames).where(eq(rpgGames.id, result.gameId)).get();
  if (row === undefined) {
    throw new Error("production game birth left no canonical RPG game row");
  }
  return row;
}

/** The host-gated hand writer owns label normalization and its every-lineage provenance. */
export async function seedRpgJournalEntry(root: ServerProducerRoot, params: Parameters<RpgService["addJournalEntry"]>[0]): Promise<RpgJournalRow> {
  const db = root.db;
  const addJournalEntry = root.services.rpg.addJournalEntry;
  const id = await addJournalEntry(params);
  const row = await db.select().from(rpgJournal).where(eq(rpgJournal.id, id)).get();
  if (row === undefined) {
    throw new Error("production journal write left no canonical RPG journal row");
  }
  return row;
}

/** A real resolved snapshot must exist; the seed never invents one to satisfy a checkpoint FK. */
export async function seedRpgCheckpoint(root: ServerProducerRoot, params: Parameters<RpgService["createCheckpoint"]>[0]): Promise<RpgCheckpointRow> {
  const db = root.db;
  const createCheckpoint = root.services.rpg.createCheckpoint;
  const id = await createCheckpoint(params);
  const row = await db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.id, id)).get();
  if (row === undefined) {
    throw new Error("production checkpoint write left no canonical RPG checkpoint row");
  }
  return row;
}

/** Capture the game's complete real sheet collection without minting absent actor defaults. */
export async function seedRpgSheets(root: ServerProducerRoot, params: Parameters<RpgService["patchSheet"]>[0]): Promise<SeededRpgSheets> {
  const db = root.db;
  const operations = root.services.rpg;
  await operations.patchSheet(params);
  const game = await operations.getGame({ principal: params.principal, chatId: params.chatId });
  const sheets = await db.select().from(rpgSheets).where(eq(rpgSheets.gameId, game.id)).orderBy(rpgSheets.id);
  if (sheets.length === 0) {
    throw new Error("production sheet patch left no canonical RPG sheet rows");
  }
  return { game, sheets };
}

export interface SeededRpgSheets {
  readonly game: Awaited<ReturnType<RpgService["getGame"]>>;
  readonly sheets: readonly RpgSheetRow[];
}

/** A real checkpoint supplies the snapshot FK; no born/default state or canon anchor is synthesized. */
export async function captureRpgSnapshot(db: Db, snapshotId: RpgCheckpointRow["snapshotId"]): Promise<RpgSnapshotRow> {
  const row = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, snapshotId)).get();
  if (row === undefined) {
    throw new Error("produced checkpoint snapshot ID has no canonical RPG snapshot row");
  }
  return row;
}
