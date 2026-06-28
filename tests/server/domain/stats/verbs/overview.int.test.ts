import type { Db } from "@orb/db";
import { beforeEach, describe, expect, test } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedOwnerStats, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.overview", () => {
  test("delegates to the owner rollup; null when none", async () => {
    const owner = await seedUser(db);
    const svc = createStatsService(db);
    expect(await svc.overview(owner)).toBeNull();
    await seedOwnerStats(db, owner, { assistantTurns: 7 });
    expect((await svc.overview(owner))?.assistantTurns).toBe(7);
  });
});
