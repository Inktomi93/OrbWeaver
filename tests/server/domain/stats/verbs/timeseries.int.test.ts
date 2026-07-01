import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedDailyStats, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.timeseries", () => {
  test("returns daily points within the window", async () => {
    const owner = await seedUser(db);
    await seedDailyStats(db, owner, "2025-06-01", { userTurns: 1 });
    await seedDailyStats(db, owner, "2025-06-09", { userTurns: 2 });
    const svc = createStatsService(db);
    const points = await svc.timeseries(owner, { from: "2025-06-05" });
    expect(points.map((p) => p.day)).toEqual(["2025-06-09"]);
  });
});
