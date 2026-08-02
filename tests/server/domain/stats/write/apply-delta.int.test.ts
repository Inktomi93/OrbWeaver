// apply-delta — the LIVE write path. The load-bearing assertions (stats.md esoteric #1/#6, invariant #5):
//   • ADDITIVE columns accumulate across deltas (`col += excluded.col`), negative increments legal;
//   • the EXTREMA merge by MIN/MAX (firstChatAt MIN, lastActivityAt/maxContextTokens/computedAt MAX);
//   • daily tokens are DECOUPLED (a delta omitting dailyTokensIn/Out leaves day.tokens untouched);
//   • a null-provider model coalesces to the `(unknown)` sentinel (one row across recompute).

import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId);
});

async function apply(delta: StatsDelta): Promise<void> {
  const batch: BatchStmt[] = [];
  applyStatsDelta(batch, db, delta);
  await db.batch(batchMany(batch));
}

function makeDelta(over: Partial<StatsDelta>): StatsDelta {
  return {
    ownerId,
    characterId,
    day: "2025-06-01",
    model: "gpt",
    provider: "openrouter",
    now: T0,
    ...over,
  };
}

describe("applyStatsDelta", () => {
  test("additive columns accumulate across deltas (char + owner + daily)", async () => {
    await apply(makeDelta({ userTurns: 1, tokensIn: 10, tokensOut: 20, dailyTokensIn: 10 }));
    await apply(makeDelta({ userTurns: 2, tokensIn: 5, tokensOut: 1, dailyTokensIn: 4 }));

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.userTurns).toBe(3);
    expect(owner?.tokensIn).toBe(15);
    expect(owner?.tokensOut).toBe(21);

    const char = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    expect(char?.userTurns).toBe(3);
    expect(char?.tokensIn).toBe(15);

    const day = (await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)))[0];
    expect(day?.tokensIn).toBe(14);
  });

  test("extrema merge by MIN/MAX, not addition", async () => {
    await apply(makeDelta({ firstAt: T0 + 500, lastAt: T0 + 500, maxContextTokens: 1000, now: T0 + 10 }));
    // A later write with an EARLIER first, LATER last, LOWER ctx, LATER now.
    await apply(makeDelta({ firstAt: T0 + 100, lastAt: T0 + 900, maxContextTokens: 500, now: T0 + 99 }));

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.firstChatAt).toBe(T0 + 100); // MIN
    expect(owner?.lastActivityAt).toBe(T0 + 900); // MAX
    expect(owner?.maxContextTokens).toBe(1000); // MAX (the lower 500 loses)
    expect(owner?.computedAt).toBe(T0 + 99); // MAX
  });

  test("daily tokens are decoupled — a delta omitting dailyTokensIn/Out leaves day.tokens untouched", async () => {
    // A message delta credits daily tokens; a variant (swipe) delta bumps day.swipes but omits dailyTokens.
    await apply(makeDelta({ tokensIn: 100, tokensOut: 200, dailyTokensIn: 100, dailyTokensOut: 200 }));
    await apply(makeDelta({ tokensIn: 50, swipes: 1 })); // variant-shaped: scalar tokens, NO dailyTokens

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.tokensIn).toBe(150); // scalar accumulates both
    const day = (await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId)))[0];
    expect(day?.tokensIn).toBe(100); // daily credits the MESSAGE stream only
    expect(day?.tokensOut).toBe(200);
    expect(day?.swipes).toBe(1);
  });

  test("negative increments are legal (a delete emits new − old)", async () => {
    await apply(makeDelta({ assistantTurns: 5, tokensOut: 100 }));
    await apply(makeDelta({ assistantTurns: -2, tokensOut: -40 }));

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.assistantTurns).toBe(3);
    expect(owner?.tokensOut).toBe(60);
  });

  test("a null-provider model coalesces to the (unknown) sentinel — one row across recompute", async () => {
    await apply(makeDelta({ model: "local", provider: null, modelGenerations: 1 }));
    await apply(makeDelta({ model: "local", provider: null, modelGenerations: 1 }));

    const rows = await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId));
    const local = rows.filter((r) => r.model === "local");
    expect(local).toHaveLength(1); // null provider did NOT split into two rows
    expect(local[0]?.provider).toBe("(unknown)");
    expect(local[0]?.generations).toBe(2);
  });

  test("character delta is skipped for a null characterId; owner + daily still written", async () => {
    await apply(makeDelta({ characterId: null, userTurns: 1 }));
    const chars = await db.select().from(characterStats);
    expect(chars).toHaveLength(0);
    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(owner?.userTurns).toBe(1);
  });
});
