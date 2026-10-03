import type { Db } from "@orb/db";
import { statsBucketStart } from "@orb/kit/stats-tally";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedUser, T0 } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.momentum", () => {
  test("returns the owner's reply timeline per character and bucket; empty for an empty library", async () => {
    const owner = await seedUser(db);
    const svc = createStatsService(db, () => STATS_NOW);
    expect(await svc.momentum(owner)).toEqual([]);
    const characterId = await seedCharacter(db, owner, { name: "Aria" });
    const chatId = await seedChat(db, characterId);
    await seedMessage(db, { chatId, seq: 1, role: "assistant", characterId, createdAt: T0, variants: [{ content: "a" }] });
    expect(await svc.momentum(owner)).toEqual([{ characterId, name: "Aria", bucketStart: statsBucketStart(T0), replies: 1 }]);
  });
});
