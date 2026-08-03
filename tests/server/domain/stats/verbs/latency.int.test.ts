import type { Db } from "@orb/db";
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

describe("stats.latency", () => {
  test("computes owner-scope percentiles from the selected variant", async () => {
    const owner = await seedUser(db);
    const ch = await seedCharacter(db, owner);
    const chatId = await seedChat(db, ch);
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "assistant",
      characterId: ch,
      variants: [{ content: "a", ttftMs: 100, genStartedAt: T0, genFinishedAt: T0 + 200 }],
    });
    const svc = createStatsService(db, () => STATS_NOW);
    const l = await svc.latency(owner, { kind: "owner" });
    expect(l.avgTtftMs).toBe(100);
    expect(l.avgGenMs).toBe(200);
  });
});
