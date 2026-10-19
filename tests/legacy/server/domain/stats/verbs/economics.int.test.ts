// Integration: stats economics verbs (the seam's Tier 2, NOT tRPC-routed) — the injected ops discovery
// composes. Thin: the persistence read is covered in depth by messages-economics.int.test.ts; here we assert
// the service binds `characterEconomics`/`characterModelEconomics` over the real db.
// @subject packages/server/src/domain/stats/verbs/economics.ts

import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "#server/domain/stats/service.ts";
import { seedCharacter, seedChat, seedMessage, seedUser } from "../_support.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.characterEconomics / characterModelEconomics", () => {
  test("project the owner's per-character + per-model economics", async () => {
    const owner = await seedUser(db);
    const character = await seedCharacter(db, owner, { id: "character_a" });
    const chat = await seedChat(db, character, { id: "chat_a" });
    await seedMessage(db, {
      chatId: chat,
      seq: 1,
      role: "assistant",
      characterId: character,
      variants: [{ model: "gpt", provider: "openrouter", tokensOut: 42, costUsd: 0.5 }],
    });

    const svc = createStatsService(databaseHandle(db), () => STATS_NOW);

    const perCharacter = await svc.characterEconomics(owner);
    expect(perCharacter).toHaveLength(1);
    expect(perCharacter[0]).toMatchObject({ characterId: character, tokensOut: 42 });

    const perModel = await svc.characterModelEconomics(owner);
    expect(perModel).toHaveLength(1);
    expect(perModel[0]).toMatchObject({
      characterId: character,
      model: "gpt",
      provider: "openrouter",
      tokensOut: 42,
    });
  });
});
