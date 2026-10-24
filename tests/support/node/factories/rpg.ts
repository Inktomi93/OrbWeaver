// RPG seeds run the production verbs and return their outcomes; rows-tier twins in `rows/rpg.ts` read the rows.

import type { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, rpgTurnToolCalls } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type RpgService = ServicesResult["services"]["rpg"];
export type RpgGameRow = typeof rpgGames.$inferSelect;
export type RpgJournalRow = typeof rpgJournal.$inferSelect;
export type RpgCheckpointRow = typeof rpgCheckpoints.$inferSelect;
type RpgSheetRow = typeof rpgSheets.$inferSelect;
type RpgSnapshotRow = typeof rpgSnapshots.$inferSelect;
export type RpgTurnToolCallsRow = typeof rpgTurnToolCalls.$inferSelect;

export interface CapturedRpgRows {
  readonly sheets: readonly RpgSheetRow[];
  readonly snapshots: readonly RpgSnapshotRow[];
  readonly journal: readonly RpgJournalRow[];
}

/** Run the game birth; the verb's result names the game. */
export async function seedRpgGame(
  root: ServerProducerRoot,
  params: Parameters<RpgService["createGame"]>[0],
): Promise<Awaited<ReturnType<RpgService["createGame"]>>> {
  return await root.services.rpg.createGame(params);
}

/** Run the checkpoint write; the id it returns names the checkpoint. */
export async function seedRpgCheckpoint(
  root: ServerProducerRoot,
  params: Parameters<RpgService["createCheckpoint"]>[0],
): Promise<Awaited<ReturnType<RpgService["createCheckpoint"]>>> {
  return await root.services.rpg.createCheckpoint(params);
}

export interface SeededRpgSheets {
  readonly game: Awaited<ReturnType<RpgService["getGame"]>>;
  readonly sheets: readonly RpgSheetRow[];
}
