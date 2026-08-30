// domain/rpg/game-mint — the ONE lite-game birth mechanism. Pins: mintLiteGame writes the `rpg_games` row
// (mode lite, active, session 1, NO born snapshot per the orchestrator ruling), mirrors the opaque chat
// pointer engaged, and emits `gameChanged` AFTER the durable write; a supplied profile carries through the
// config schema instead of the freeform default.

import { RPG_PROFILE_D20, RPG_PROFILE_FREEFORM } from "@orb/contracts/rpg";
import { rpgGames } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { mintLiteGame } from "../../../../packages/server/src/domain/rpg/game-mint.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeRpgService, seedChat } from "./_support.ts";

describe("mintLiteGame", () => {
  test("writes the born row (lite/active/session 1, no born snapshot), mirrors the pointer, emits gameChanged", async () => {
    const db = await freshDb();
    const h = makeRpgService(db);
    const chatId = await seedChat(db, "birth");

    const gameId = await mintLiteGame(h.ctx, { chatId });

    const [row] = await db.select().from(rpgGames).where(eq(rpgGames.id, gameId));
    expect(row).toMatchObject({ chatId, mode: "lite", status: "active", sessionNumber: 1, gmUserId: null, gmPresetId: null });
    expect(h.fakes.pointers).toEqual([{ chatId, gameId, engaged: true }]);
    expect(h.fakes.busEvents).toEqual([{ type: "gameChanged", chatId }]);
    expect(row?.config.statProfile).toEqual(RPG_PROFILE_FREEFORM);
  });

  test("a supplied profile carries through the config schema instead of the freeform default", async () => {
    const db = await freshDb();
    const h = makeRpgService(db);
    const chatId = await seedChat(db, "birth2");

    const gameId = await mintLiteGame(h.ctx, { chatId, profile: RPG_PROFILE_D20 });

    const [row] = await db.select().from(rpgGames).where(eq(rpgGames.id, gameId));
    expect(row?.config.statProfile).toEqual(RPG_PROFILE_D20);
    expect(row?.config.statProfile.defaultAttribute).toBe("str");
  });
});
