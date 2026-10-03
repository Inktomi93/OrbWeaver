import type { Db } from "@orb/db";
import { STATS_BUCKET_MS, statsBucketStart } from "@orb/kit/stats-tally";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedDailyStats, seedUser, T0 } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.timeseries", () => {
  test("returns the timeline buckets from the window's start", async () => {
    const owner = await seedUser(db);
    const early = statsBucketStart(T0);
    const late = early + STATS_BUCKET_MS;
    await seedDailyStats(db, owner, early, { userTurns: 1 });
    await seedDailyStats(db, owner, late, { userTurns: 2 });
    const svc = createStatsService(db, () => STATS_NOW);
    const points = await svc.timeseries(owner, { from: late });
    expect(points.map((p) => [p.bucketStart, p.userTurns])).toEqual([[late, 2]]);
  });
});
