// persistence/activity — per-character momentum across the two most-recent active months (D28), D18
// membership-scoped.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { readCharacterMomentum } from "../../../../../packages/server/src/domain/stats/persistence/activity.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { DAY, seedCharacter, seedChat, seedMessage, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId);
});

describe("readCharacterMomentum", () => {
  test("computes rising deltas across the two most-recent active months", async () => {
    const chatId = await seedChat(db, characterId);
    // One assistant turn ~40 days before T0 (prev month), three at T0 (latest month).
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "assistant",
      characterId,
      createdAt: T0 - 40 * DAY,
      variants: [{ content: "old" }],
    });
    const newTurn = (seq: number): Promise<unknown> =>
      seedMessage(db, {
        chatId,
        seq,
        role: "assistant",
        characterId,
        createdAt: T0,
        variants: [{ content: "new" }],
      });
    // Sequential (the seeder shares a counter + per-chat seq is unique) — three latest-month turns.
    await newTurn(2);
    await newTurn(3);
    await newTurn(4);
    const m = await readCharacterMomentum(db, ownerId);
    expect(m.latestMonth).not.toBeNull();
    expect(m.prevMonth).not.toBeNull();
    expect(m.rising).toHaveLength(1);
    expect(m.rising[0]?.current).toBe(3);
    expect(m.rising[0]?.prev).toBe(1);
    expect(m.rising[0]?.delta).toBe(2);
  });

  test("fewer than two active months → empty momentum", async () => {
    const chatId = await seedChat(db, characterId);
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "assistant",
      characterId,
      createdAt: T0,
      variants: [{ content: "only" }],
    });
    const m = await readCharacterMomentum(db, ownerId);
    expect(m).toEqual({ latestMonth: null, prevMonth: null, rising: [], falling: [] });
  });
});
