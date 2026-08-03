import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedOwnerStats, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.overview", () => {
  test("delegates to the owner rollup; null when none", async () => {
    const owner = await seedUser(db);
    const svc = createStatsService(db, () => STATS_NOW);
    expect(await svc.overview(owner)).toBeNull();
    await seedOwnerStats(db, owner, { assistantTurns: 7 });
    expect((await svc.overview(owner))?.assistantTurns).toBe(7);
  });
});
