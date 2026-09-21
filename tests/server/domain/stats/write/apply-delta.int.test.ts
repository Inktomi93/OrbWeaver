// apply-delta — the LIVE write path. The load-bearing assertions (the stats design doc esoteric #1/#6, invariant #5):
//   • ADDITIVE columns accumulate across deltas (`col += excluded.col`), negative increments legal;
//   • the EXTREMA merge by MIN/MAX (firstChatAt MIN, lastActivityAt/maxContextTokens/computedAt MAX);
//   • daily tokens are DECOUPLED (a delta omitting dailyTokensIn/Out leaves day.tokens untouched);
//   • a null-provider model coalesces to the `(unknown)` sentinel (one row across recompute).

import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characterStats, dailyStats, modelStats, ownerStats, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
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
    model: testModelId("gpt"),
    provider: testProviderId("openrouter"),
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
    const version = (await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, ownerId)))[0];
    expect(version?.version).toBe(2);
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
    await apply(makeDelta({ model: testModelId("local"), provider: null, modelGenerations: 1 }));
    await apply(makeDelta({ model: testModelId("local"), provider: null, modelGenerations: 1 }));

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

  // #1147 — the room count is GRAIN-SPLIT: `character_stats.chats` reads `characterChats` and
  // `owner_stats.chats` reads `chats`, so a two-seat room can credit its second seat's census without
  // counting the room twice in the owner's library. A single shared field could not express that, and the
  // live plane simply dropped the second seat. Both directions are pinned: a SEAT-only delta must not move
  // the owner, and an OWNER-only delta must not move the census.
  test("the chat count is grain-split: a seat delta credits only the character, an owner delta only the owner", async () => {
    await apply(makeDelta({ chats: 1, characterChats: 1, forkedChats: 1, characterForkedChats: 1 }));
    await apply(makeDelta({ characterChats: 1, characterForkedChats: 1 }));
    const char = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    // Two seats of the same character-grain event…
    expect(char).toMatchObject({ chats: 2, forkedChats: 2 });
    // …and the owner's library still counted the ONE room the first delta carried.
    expect(owner).toMatchObject({ chats: 1, forkedChats: 1 });
  });
});
