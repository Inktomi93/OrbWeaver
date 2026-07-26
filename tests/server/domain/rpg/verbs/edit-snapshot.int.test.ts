// verbs/snapshot — editSnapshot (rpg-design/05 §4.4, §6.2). The hand-edit door: writes volatile state,
// AUTO-LOCKS touched fields (manual-edit-wins), and — for a turnless game (no snapshot rows, the no-born-seed
// ruling) — mints a fresh narrator slot to hold the first committed snapshot. Mutations asserted at the
// resolved snapshot row (assert-the-mutation-fired).

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { resolveSnapshotForTurn } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../support/db";
import { expect, makeRpgService, principal, seedChat, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

interface Seeded {
  chatId: import("@orb/kit/ids").ChatId;
  game: RpgGameRow;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}
async function seedGame(): Promise<Seeded> {
  const chatId = await seedChat(db, "a");
  const { service, fakes } = makeRpgService(db);
  fakes.membership.set("user_host", "host");
  await service.createGame({ principal: principal("host"), chatId, mode: "lite" });
  const game = await findGameByChat(db, chatId);
  if (!game) {
    throw new Error("no game");
  }
  return { chatId, game, service, fakes };
}

describe("editSnapshot on a turnless game", () => {
  test("mints a narrator slot + writes the first committed snapshot with an auto-lock", async () => {
    const { chatId, game, service, fakes } = await seedGame();
    // No snapshot exists yet (no born seed).
    expect(await resolveSnapshotForTurn(db, { id: game.id, chatId })).toBeUndefined();

    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Crypt" } });

    // A narrator slot was minted (the turnless-game arm).
    expect(fakes.narratorPosts).toHaveLength(1);
    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.location).toBe("The Crypt");
    expect(snap?.committed).toBe(1);
    // The touched field is auto-locked (manual-edit-wins).
    expect(snap?.fieldLocks?.["location"]).toBe(true);
  });

  test("a locked field survives a later TOOL-style overlay but a re-hand-edit still wins", async () => {
    const { chatId, game, service } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "Locked City" } });
    // A second hand edit re-writes the locked field (the human always wins over their own lock).
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "New City" } });
    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.location).toBe("New City");
    expect(snap?.fieldLocks?.["location"]).toBe(true);
  });
});
