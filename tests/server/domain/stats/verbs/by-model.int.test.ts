import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedModelStats, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.byModel", () => {
  test("returns per-(model, provider) rows", async () => {
    const owner = await seedUser(db);
    await seedModelStats(db, owner, { model: "gpt", provider: "openrouter", generations: 5 });
    const svc = createStatsService(db, () => STATS_NOW);
    const rows = await svc.byModel(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe("gpt");
    expect(rows[0]?.generations).toBe(5);
  });
});
