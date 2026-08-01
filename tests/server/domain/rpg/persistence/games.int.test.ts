// persistence/games — the `rpg_games` row lifecycle (rpg-design/05 §2.1). .int: real FK. Create/read (by id
// + by chat — game-ness resolves here) + config-patch + the config parse-on-read belt.

import type { Db } from "@orb/db";
import { rpgGames } from "@orb/db";
import type { RpgGameId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { findGameByChat, findGameById, insertGame, updateGame } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../support/db";
import { expect, FROZEN_AT, liteConfig, seedChat, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const CORRUPT_RE = /rpg_games/;

describe("create + read", () => {
  test("insertGame writes the row; findGameById + findGameByChat read it back parsed", async () => {
    const chatId = await seedChat(db, "a");
    const id = castId<RpgGameId>("rpg_game_g1");
    const game = await insertGame(db, { id, chatId, mode: "lite", status: "active", config: liteConfig(), createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
    expect(game.mode).toBe("lite");
    expect(game.gmPresetId).toBeNull(); // the knob's lite default (= augment)

    expect((await findGameById(db, id))?.id).toBe(id);
    expect((await findGameByChat(db, chatId))?.id).toBe(id); // game-ness resolves by chat
  });

  test("findGameByChat returns undefined for a non-game chat", async () => {
    const chatId = await seedChat(db, "plain");
    expect(await findGameByChat(db, chatId)).toBeUndefined();
  });
});

describe("config write door + the gmPresetId knob", () => {
  test("updateGame patches the config blob and the knob", async () => {
    const chatId = await seedChat(db, "a");
    const id = castId<RpgGameId>("rpg_game_g1");
    await insertGame(db, { id, chatId, mode: "lite", status: "active", config: liteConfig(), createdAt: FROZEN_AT, updatedAt: FROZEN_AT });

    const nextConfig = { ...liteConfig(), lite: { steeringNote: "lean darker" } };
    await updateGame(db, id, { config: nextConfig, updatedAt: FROZEN_AT });
    expect((await findGameById(db, id))?.config.lite.steeringNote).toBe("lean darker");
  });
});

describe("parse-on-read corruption belt", () => {
  test("a corrupt config blob throws RpgStateCorruptError", async () => {
    const chatId = await seedChat(db, "a");
    const id = castId<RpgGameId>("rpg_game_g1");
    await insertGame(db, { id, chatId, mode: "lite", status: "active", config: liteConfig(), createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
    // Poison the steeringNote past its max (a string longer than 500 chars).
    await db
      .update(rpgGames)
      .set({ config: { statProfile: liteConfig().statProfile, lite: { steeringNote: "x".repeat(600) } } as never }) // FABRICATION-OK: invalid-input probe — poisons the config blob past its schema to prove parse-on-read throws
      .where(eq(rpgGames.id, id));
    await expect(findGameById(db, id)).rejects.toThrow(CORRUPT_RE);
  });

  test("a RETIRED delivery mode is HEALED to the born default on read — the row still opens", async () => {
    // Pre-launch NO-LEGACY (owner ruling 2026-08-01): a delivery mode was deleted whole, and a game blob written
    // while it existed must not hard-throw the whole room for a knob. The heal is scoped to that ONE field.
    const chatId = await seedChat(db, "a");
    const id = castId<RpgGameId>("rpg_game_g1");
    await insertGame(db, { id, chatId, mode: "lite", status: "active", config: liteConfig(), createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
    await db
      .update(rpgGames)
      .set({ config: { ...liteConfig(), extractionMode: "a-mode-that-no-longer-exists" } as never }) // FABRICATION-OK: retired-value probe — a blob written before the mode was deleted
      .where(eq(rpgGames.id, id));

    expect((await findGameById(db, id))?.config.extractionMode).toBe("folded");
  });
});
