// Rollups are rebuilt by the real stats operation; the live-write canon fence is captured, never synthesized.
import type { Db } from "@orb/db";
import { characterStats, characters, dailyStats, modelStats, ownerStats, statsCanonVersions } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";

type Reconcile = ServicesResult["services"]["stats"]["reconcile"];
export type StatsCanonVersionRow = typeof statsCanonVersions.$inferSelect;
export type OwnerStatsRow = typeof ownerStats.$inferSelect;
export type CharacterStatsRow = typeof characterStats.$inferSelect;
export type DailyStatsRow = typeof dailyStats.$inferSelect;
export type ModelStatsRow = typeof modelStats.$inferSelect;

/** Reconciliation does not create a canon fence for an owner with no live stats mutation. */
export async function seedStats(db: Db, reconcile: Reconcile, ownerId: Parameters<Reconcile>[0]): Promise<SeededStats> {
  const result = await reconcile(ownerId);
  const owner = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)).get();
  if (owner === undefined) {
    throw new Error("production reconciliation left no canonical owner-stats row");
  }
  const canonVersion = await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, ownerId)).get();
  const characterRows = await db
    .select({ row: characterStats })
    .from(characterStats)
    .innerJoin(characters, eq(characters.id, characterStats.characterId))
    .where(eq(characters.ownerId, ownerId))
    .orderBy(characterStats.characterId);
  const daily = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)).orderBy(dailyStats.bucketStart);
  const models = await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId)).orderBy(modelStats.model, modelStats.provider);
  return { result, owner, canonVersion, characters: characterRows.map(({ row }) => row), daily, models };
}

export interface SeededStats {
  readonly result: Awaited<ReturnType<Reconcile>>;
  readonly owner: OwnerStatsRow;
  readonly canonVersion: StatsCanonVersionRow | undefined;
  readonly characters: readonly CharacterStatsRow[];
  readonly daily: readonly DailyStatsRow[];
  readonly models: readonly ModelStatsRow[];
}
