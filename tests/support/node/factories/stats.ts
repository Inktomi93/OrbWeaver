// The Stats rollup row and result shapes; the reads that return them live in the rows tier (`rows/stats.ts`).

import type { characterStats, chats, dailyStats, messages, messageVariants, modelStats, ownerStats, statsCanonVersions } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";

export type Reconcile = ServicesResult["services"]["stats"]["reconcile"];
type StatsCanonVersionRow = typeof statsCanonVersions.$inferSelect;
type OwnerStatsRow = typeof ownerStats.$inferSelect;
type CharacterStatsRow = typeof characterStats.$inferSelect;
type DailyStatsRow = typeof dailyStats.$inferSelect;
type ModelStatsRow = typeof modelStats.$inferSelect;

export interface SeededStats {
  readonly result: Awaited<ReturnType<Reconcile>>;
  readonly owner: OwnerStatsRow;
  readonly canonVersion: StatsCanonVersionRow | undefined;
  readonly characters: readonly CharacterStatsRow[];
  readonly daily: readonly DailyStatsRow[];
  readonly models: readonly ModelStatsRow[];
}

type StatsService = ServicesResult["services"]["stats"];

export interface CapturedStatsPopulations {
  readonly rows: SeededStats;
  readonly chats: readonly (typeof chats.$inferSelect)[];
  readonly messages: readonly (typeof messages.$inferSelect)[];
  readonly variants: readonly (typeof messageVariants.$inferSelect)[];
  readonly overview: Awaited<ReturnType<StatsService["overview"]>>;
  readonly ownerLatency: Awaited<ReturnType<StatsService["latency"]>>;
  readonly models: Awaited<ReturnType<StatsService["byModel"]>>;
  readonly economics: Awaited<ReturnType<StatsService["characterEconomics"]>>;
  readonly modelEconomics: Awaited<ReturnType<StatsService["characterModelEconomics"]>>;
  readonly characters: readonly Awaited<ReturnType<StatsService["character"]>>[];
  readonly latency: readonly Awaited<ReturnType<StatsService["latency"]>>[];
}
