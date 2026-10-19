// @subject packages/server/src/domain/stats/verbs/by-model.ts

import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "#server/domain/stats/service.ts";
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
    const rows = await createStatsService(databaseHandle(db), () => STATS_NOW).byModel(owner);
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
    const svc = createStatsService(databaseHandle(db), () => STATS_NOW);
    const rows = await svc.byModel(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe("gpt");
    expect(rows[0]?.generations).toBe(5);
  });
});
