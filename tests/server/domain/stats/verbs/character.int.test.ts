import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedCharacterStats, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.character", () => {
  test("returns the owned character's rollup + name", async () => {
    const owner = await seedUser(db);
    const ch = await seedCharacter(db, owner, { name: "Aria" });
    await seedCharacterStats(db, ch, { assistantTurns: 4 });
    const svc = createStatsService(db);
    const c = await svc.character(owner, ch);
    expect(c?.name).toBe("Aria");
    expect(c?.assistantTurns).toBe(4);
  });
});
