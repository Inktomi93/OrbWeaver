import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedCharacterStats, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.leaderboard", () => {
  test("returns the owner's characters", async () => {
    const owner = await seedUser(db);
    const ch = await seedCharacter(db, owner, { id: "character_a", name: "A" });
    await seedCharacterStats(db, ch, { assistantTurns: 2 });
    const svc = createStatsService(db, () => STATS_NOW);
    const page = await svc.leaderboard(owner);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.name).toBe("A");
    expect(page.total).toBe(1);
  });

  describe("search (the LIST-pane name filter that reaches past the page cap)", () => {
    async function seedRanked(owner: UserId, id: string, name: string, assistantTurns: number): Promise<void> {
      const ch = await seedCharacter(db, owner, { id, name });
      await seedCharacterStats(db, ch, { assistantTurns });
    }

    /** Three ranked characters so a search proves it narrows both the rows AND the census. */
    async function seedThree(): Promise<UserId> {
      const owner = await seedUser(db);
      await seedRanked(owner, "character_tam", "Tamsin", 30);
      await seedRanked(owner, "character_kat", "Kate", 20);
      await seedRanked(owner, "character_bolt", "Bolt", 10);
      return owner;
    }

    test("narrows the rows AND the total to the name matches", async () => {
      const owner = await seedThree();
      const svc = createStatsService(db, () => STATS_NOW);
      const page = await svc.leaderboard(owner, { search: "kat" });
      expect(page.rows.map((r) => r.name)).toEqual(["Kate"]);
      // The census narrows WITH the rows — the band reads "1 of 1", never "1 of 3".
      expect(page.total).toBe(1);
    });

    test("is case-insensitive", async () => {
      const owner = await seedThree();
      const svc = createStatsService(db, () => STATS_NOW);
      const page = await svc.leaderboard(owner, { search: "TAM" });
      expect(page.rows.map((r) => r.name)).toEqual(["Tamsin"]);
      expect(page.total).toBe(1);
    });

    test("a substring matching nobody returns no rows and a zero census", async () => {
      const owner = await seedThree();
      const svc = createStatsService(db, () => STATS_NOW);
      const page = await svc.leaderboard(owner, { search: "zzz" });
      expect(page.rows).toHaveLength(0);
      expect(page.total).toBe(0);
    });

    test("a blank search is the whole ranked population (the rest state)", async () => {
      const owner = await seedThree();
      const svc = createStatsService(db, () => STATS_NOW);
      const page = await svc.leaderboard(owner, { search: "   " });
      expect(page.rows).toHaveLength(3);
      expect(page.total).toBe(3);
    });

    test("LIKE wildcards in the term match literally, not as wildcards", async () => {
      const owner = await seedUser(db);
      await seedRanked(owner, "character_pct", "50% Off", 5);
      await seedRanked(owner, "character_plain", "Plain", 5);
      const svc = createStatsService(db, () => STATS_NOW);
      // A bare "%" would match everything if unescaped; escaped, it matches only the literal percent name.
      const page = await svc.leaderboard(owner, { search: "%" });
      expect(page.rows.map((r) => r.name)).toEqual(["50% Off"]);
      expect(page.total).toBe(1);
    });
  });
});
