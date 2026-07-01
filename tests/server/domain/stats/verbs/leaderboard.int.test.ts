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

describe("stats.leaderboard", () => {
  test("returns the owner's characters", async () => {
    const owner = await seedUser(db);
    const ch = await seedCharacter(db, owner, { id: "character_a", name: "A" });
    await seedCharacterStats(db, ch, { assistantTurns: 2 });
    const svc = createStatsService(db);
    const rows = await svc.leaderboard(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("A");
  });
});
