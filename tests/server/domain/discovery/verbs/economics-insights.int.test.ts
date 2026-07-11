// Integration: PD-22/PD-40 economics-composed insights (the stats↔discovery seam Tier 3) — forgottenGems
// (semantic volume/recency ranking + injected per-character economics) + modelRouting (distilled genre ×
// per-(character, model) economics). The harness wires the REAL stats economics reads over the same db, so
// this exercises the true composition (not a mocked op).

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedCharacter,
  seedChat,
  seedMessage,
  seedUser,
} from "../_support.ts";

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

async function seedGenre(db: Db, characterId: CharacterId, genre: string): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId,
    genre,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
}

describe("forgottenGems", () => {
  test("ranks by message volume (then staleness) and attaches injected economics", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedChat(db, "chat_a");
    const invested = await seedCharacter(db, {
      id: "character_inv",
      ownerId: owner,
      name: "Invested",
    });
    const light = await seedCharacter(db, { id: "character_lite", ownerId: owner, name: "Light" });

    // Invested: 2 assistant turns, tokensOut 30 + 40 = 70.
    await seedMessage(db, {
      id: "m_inv_1",
      chatId: chat,
      seq: 1,
      createdAt: 1000,
      characterId: invested,
      variant: { model: "gpt", tokensOut: 30, costUsd: 0.03 },
    });
    await seedMessage(db, {
      id: "m_inv_2",
      chatId: chat,
      seq: 2,
      createdAt: 2000,
      characterId: invested,
      variant: { model: "gpt", tokensOut: 40, costUsd: 0.04 },
    });
    // Light: 1 turn.
    await seedMessage(db, {
      id: "m_lite_1",
      chatId: chat,
      seq: 3,
      createdAt: 5000,
      characterId: light,
      variant: { model: "gpt", tokensOut: 5, costUsd: 0.01 },
    });

    const gems = await svcFor(db).forgottenGems(owner);
    expect(gems.map((g) => g.characterId)).toEqual([invested, light]);
    expect(gems[0]).toMatchObject({ messageCount: 2, tokensOut: 70 });
    expect(gems[0]?.costUsd).toBeCloseTo(0.07);
    expect(gems[1]).toMatchObject({ characterId: light, messageCount: 1, tokensOut: 5 });
  });

  test("honors the limit", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedChat(db, "chat_a");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    await seedMessage(db, { id: "m_a", chatId: chat, seq: 1, createdAt: 1, characterId: a });
    await seedMessage(db, { id: "m_b", chatId: chat, seq: 2, createdAt: 2, characterId: b });
    expect(await svcFor(db).forgottenGems(owner, 1)).toHaveLength(1);
  });
});

describe("modelRouting", () => {
  test("groups per-(character, model) economics by the character's distilled genre", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedChat(db, "chat_a");
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    const lover = await seedCharacter(db, { id: "character_love", ownerId: owner, name: "Lover" });
    // A character with NO distilled genre — its turns can't be attributed, so they're skipped.
    const unlabelled = await seedCharacter(db, { id: "character_x", ownerId: owner, name: "X" });
    await seedGenre(db, hero, "adventure");
    await seedGenre(db, lover, "romance");

    await seedMessage(db, {
      id: "m_hero_1",
      chatId: chat,
      seq: 1,
      createdAt: 1000,
      characterId: hero,
      variant: { model: "gpt", tokensOut: 100, genStartedAt: 0, genFinishedAt: 500 },
    });
    await seedMessage(db, {
      id: "m_hero_2",
      chatId: chat,
      seq: 2,
      createdAt: 2000,
      characterId: hero,
      variant: { model: "gpt", tokensOut: 50, genStartedAt: 0, genFinishedAt: 300 },
    });
    await seedMessage(db, {
      id: "m_love_1",
      chatId: chat,
      seq: 3,
      createdAt: 3000,
      characterId: lover,
      variant: { model: "claude", tokensOut: 20 },
    });
    await seedMessage(db, {
      id: "m_x_1",
      chatId: chat,
      seq: 4,
      createdAt: 4000,
      characterId: unlabelled,
      variant: { model: "gpt", tokensOut: 999 },
    });

    const rows = await svcFor(db).modelRouting(owner);
    expect(rows).toEqual([
      {
        genre: "adventure",
        model: "gpt",
        provider: null,
        generations: 2,
        tokensOut: 150,
        avgGenTimeMs: 400,
        costUsd: 0,
      },
      {
        genre: "romance",
        model: "claude",
        provider: null,
        generations: 1,
        tokensOut: 20,
        avgGenTimeMs: null,
        costUsd: 0,
      },
    ]);
  });
});
