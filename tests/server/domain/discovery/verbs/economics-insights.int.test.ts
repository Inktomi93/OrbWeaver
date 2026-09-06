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
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedCharacterParticipant, seedChat, seedMessage, seedUser } from "../_support.ts";

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
  test("INVESTED **AND** QUIET is a conjunction: the most-played character is not the headline gem", async () => {
    // The shelf is titled "Invested, but quiet" and used to sort by messageCount with lastActiveAt as a
    // tie-break — on a real library 20 of 20 candidates had distinct counts, so the quiet term never fired
    // and the top tile was the character played six hours ago (corpus forensics §6). The rank is now
    // messageCount × log1p(days quiet), measured against the library's own newest activity (no clock).
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedChat(db, "chat_a");
    const live = await seedCharacter(db, { id: "character_live", ownerId: owner, name: "Live" });
    const quietBig = await seedCharacter(db, { id: "character_big", ownerId: owner, name: "QuietBig" });
    const quietSmall = await seedCharacter(db, { id: "character_small", ownerId: owner, name: "QuietSmall" });
    const day = 86_400_000;

    // Live: the most played BY FAR, and played most recently — quiet = 0, so it is not forgotten at all.
    // QuietBig: real investment, 60 days untouched. QuietSmall: quieter still, but barely played — age
    // alone must not beat real investment.
    const turns = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `m_live_${i.toString()}`, seq: 100 + i, createdAt: FROZEN_AT, characterId: live })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `m_big_${i.toString()}`, seq: 200 + i, createdAt: FROZEN_AT - 60 * day, characterId: quietBig })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `m_small_${i.toString()}`, seq: 300 + i, createdAt: FROZEN_AT - 90 * day, characterId: quietSmall })),
    ];
    await Promise.all(turns.map((turn) => seedMessage(db, { ...turn, chatId: chat, variant: {} })));

    const gems = await svcFor(db).forgottenGems(owner);
    expect(gems.map((g) => g.characterId)).toEqual([quietBig, quietSmall, live]);
  });

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
    await seedCharacterParticipant(db, chat, invested);
    await seedCharacterParticipant(db, chat, light);

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
    expect(gems[0]).toMatchObject({ messageCount: 2, tokensOut: 70, tokensOutProvenance: "measured" });
    expect(gems[0]?.costUsd).toBeCloseTo(0.07);
    expect(gems[1]).toMatchObject({ characterId: light, messageCount: 1, tokensOut: 5 });
  });

  test("preserves estimated output provenance for the client label", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_estimated");
    const chat = await seedChat(db, "chat_estimated");
    const character = await seedCharacter(db, { id: "character_estimated", ownerId: owner, name: "Estimated" });
    await seedCharacterParticipant(db, chat, character);
    await seedMessage(db, {
      id: "m_estimated",
      chatId: chat,
      seq: 1,
      createdAt: 1000,
      characterId: character,
      variant: { tokensOut: 12, tokenProvenance: "estimated" },
    });

    expect((await svcFor(db).forgottenGems(owner))[0]).toMatchObject({ tokensOut: 12, tokensOutProvenance: "estimated" });
  });

  test("honors the limit", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedChat(db, "chat_a");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    // `variant` is required for a slot to be VISIBLE canon (the gem read inner-joins the selected variant,
    // as every canon read does) — a pointer-less slot is invisible in production too.
    await seedMessage(db, { id: "m_a", chatId: chat, seq: 1, createdAt: 1, characterId: a, variant: {} });
    await seedMessage(db, { id: "m_b", chatId: chat, seq: 2, createdAt: 2, characterId: b, variant: {} });
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
    await seedCharacterParticipant(db, chat, hero);
    await seedCharacterParticipant(db, chat, lover);
    await seedCharacterParticipant(db, chat, unlabelled);
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
        tokensOutProvenance: "measured",
        avgGenTimeMs: 400,
        costUsd: null,
      },
      {
        genre: "romance",
        model: "claude",
        provider: null,
        generations: 1,
        tokensOut: 20,
        tokensOutProvenance: "measured",
        avgGenTimeMs: null,
        costUsd: null,
      },
    ]);
  });
});
