import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.momentum", () => {
  test("empty owner → empty momentum", async () => {
    const owner = await seedUser(db);
    const svc = createStatsService(db);
    const m = await svc.momentum(owner);
    expect(m).toEqual({ latestMonth: null, prevMonth: null, rising: [], falling: [] });
  });
});
