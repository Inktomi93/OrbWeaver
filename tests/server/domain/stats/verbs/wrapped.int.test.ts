import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedCharacterStats, seedOwnerStats, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.wrapped", () => {
  test("assembles the headline; null without a rollup", async () => {
    const owner = await seedUser(db);
    const svc = createStatsService(db, () => STATS_NOW);
    expect(await svc.wrapped(owner)).toBeNull();
    const ch = await seedCharacter(db, owner, { name: "Star" });
    await seedOwnerStats(db, owner, { assistantTurns: 3, userWords: 4, assistantWords: 6 });
    await seedCharacterStats(db, ch, { assistantTurns: 3 });
    const w = await svc.wrapped(owner);
    expect(w?.words).toBe(10);
    expect(w?.topCharacter?.name).toBe("Star");
  });
});
