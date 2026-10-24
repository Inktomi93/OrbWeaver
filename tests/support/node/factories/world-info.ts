// The World-info row and result shapes; the reads that return them live in the rows tier (`rows/world-info.ts`).

import type { characterBooks, chatBooks, globalBooks, personaBooks, worldBooks, worldEntries } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";

export type WorldInfoService = ServicesResult["services"]["worldInfo"];

export type WorldBookRow = typeof worldBooks.$inferSelect;
export type WorldEntryRow = typeof worldEntries.$inferSelect;
export type CharacterBookRow = typeof characterBooks.$inferSelect;
export type ChatBookRow = typeof chatBooks.$inferSelect;
export type GlobalBookRow = typeof globalBooks.$inferSelect;
export type PersonaBookRow = typeof personaBooks.$inferSelect;

export interface SeededWorldTitleBackfill {
  readonly result: Awaited<ReturnType<WorldInfoService["backfillTitles"]>>;
  readonly entries: readonly WorldEntryRow[];
}

export interface CapturedWorldBookRows {
  readonly book: WorldBookRow;
  readonly entries: readonly WorldEntryRow[];
  readonly character: readonly CharacterBookRow[];
  readonly chat: readonly ChatBookRow[];
  readonly global: readonly GlobalBookRow[];
  readonly persona: readonly PersonaBookRow[];
}
