import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedOwnerStats, seedUser, T0 } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.freshness", () => {
  test("hasData flips once a rollup exists; stale is always false", async () => {
    const owner = await seedUser(db);
    const svc = createStatsService(db);
    expect(await svc.freshness(owner)).toEqual({ computedAt: null, stale: false, hasData: false });
    await seedOwnerStats(db, owner, { computedAt: T0 });
    expect(await svc.freshness(owner)).toEqual({ computedAt: T0, stale: false, hasData: true });
  });
});
