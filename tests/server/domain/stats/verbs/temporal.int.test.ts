import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedDailyStats, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.temporal", () => {
  test("derives active days from daily_stats", async () => {
    const owner = await seedUser(db);
    await seedDailyStats(db, owner, "2025-06-01", { userTurns: 1 });
    await seedDailyStats(db, owner, "2025-06-03", { assistantTurns: 2 });
    const svc = createStatsService(db, () => STATS_NOW);
    const t = await svc.temporal(owner);
    expect(t.activeDays).toBe(2);
  });
});
