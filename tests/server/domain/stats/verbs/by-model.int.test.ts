import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedModelStats, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.byModel", () => {
  test("input-only execution has no reply rate, while recorded zero-output generation preserves zero", async () => {
    const owner = await seedUser(db);
    await seedModelStats(db, owner, { model: "embed-only", provider: "google", generations: 0, tokensIn: 34, tokensInMeasuredSamples: 1 });
    await seedModelStats(db, owner, {
      model: "reported-zero",
      provider: "google",
      generations: 1,
      tokensOut: 0,
      tokensOutMeasuredSamples: 1,
      genTimeMs: 1000,
      genSamples: 1,
    });
    const rows = await createStatsService(db, () => STATS_NOW).byModel(owner);
    expect(rows.find((row) => row.model === "embed-only")).toMatchObject({
      tokensIn: 34,
      tokensOut: null,
      reasoningRate: null,
      throughputTps: null,
      generations: 0,
    });
    expect(rows.find((row) => row.model === "reported-zero")).toMatchObject({ tokensOut: 0, reasoningRate: 0, throughputTps: 0 });
  });
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
