import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedPersona, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.personaUsage", () => {
  test("reports a persona used as a chat's anchor", async () => {
    const owner = await seedUser(db);
    const persona = await seedPersona(db, owner, { name: "Hero" });
    const ch = await seedCharacter(db, owner);
    const chatId = await seedChat(db, ch, { anchorPersonaId: persona });
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "assistant",
      characterId: ch,
      variants: [{ content: "hi", tokensOut: 3 }],
    });
    const svc = createStatsService(db, () => STATS_NOW);
    const rows = await svc.personaUsage(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chatCount).toBe(1);
    expect(rows[0]?.tokensOut).toBe(3);
  });
});
