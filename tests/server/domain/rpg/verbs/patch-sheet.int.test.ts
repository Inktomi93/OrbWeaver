// verbs/sheet — patchSheet (rpg-design/05 §4.4, §6.2). MA-4 patch semantics (omit preserves; a null maxHp is a
// real clear) + attribute-key ∈ profile-vocabulary + range enforcement. Row-on-first-write. Mutations asserted
// at the persisted row (assert-the-mutation-fired).

import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { findSheet } from "../../../../../packages/server/src/domain/rpg/persistence/sheets";
import { freshDb } from "../../../../support/db";
import { expect, makeRpgService, principal, seedChat, seedUser, test } from "../_support";

const RANGE_RE = /out of range/i;
const UNKNOWN_ATTR_RE = /not in the profile/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function seedGame(): Promise<{
  chatId: import("@orb/kit/ids").ChatId;
  userId: import("@orb/kit/ids").UserId;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}> {
  const chatId = await seedChat(db, "a");
  const userId = await seedUser(db, castId<Handle>("host"));
  const { service, fakes } = makeRpgService(db);
  fakes.membership.set("user_host", "host");
  await service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite", profile: RPG_PROFILE_D20 });
  fakes.busEvents.length = 0; // drop the createGame emit — the tests below assert the patchSheet emit alone
  return { chatId, userId, service, fakes };
}

describe("patchSheet", () => {
  test("row-on-first-write; a second patch MERGES (omit preserves)", async () => {
    const { chatId, userId, service, fakes } = await seedGame();
    const ref = { kind: "user" as const, userId };
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { className: "Rogue", attributes: { str: 12 } } });
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    let sheet = (await findSheet(db, game.id, { userId }))?.sheet;
    expect(sheet?.className).toBe("Rogue");
    expect(sheet?.attributes["str"]).toBe(12);
    // §4.9: patchSheet emits `sheetChanged` with the row's real id.
    const row = await findSheet(db, game.id, { userId });
    expect(fakes.busEvents).toEqual([{ type: "sheetChanged", chatId, sheetId: row?.id }]);

    // A patch that omits className keeps it; adds dex.
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { attributes: { str: 12, dex: 15 } } });
    sheet = (await findSheet(db, game.id, { userId }))?.sheet;
    expect(sheet?.className).toBe("Rogue"); // preserved
    expect(sheet?.attributes["dex"]).toBe(15);
  });

  test("maxHp is GONE from the sheet door (R3) — a stray key writes nothing, it is not a field", async () => {
    // The clear-vs-keep semantic it used to pin now lives on `level` (the test below); what is pinned HERE is
    // that the retired dial cannot be resurrected by a caller who still sends it: the dual-max home the
    // unification killed for pools does not come back through the wire.
    const { chatId, userId, service } = await seedGame();
    const ref = { kind: "user" as const, userId };
    // The point is that a caller still sending the retired dial writes nothing — only expressible by sending
    // a key the type no longer has.
    // FABRICATION-OK: a deliberate INVALID-INPUT probe (the retired `maxHp` key).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { maxHp: 30 } as never });
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    expect((await findSheet(db, game.id, { userId }))?.sheet).not.toHaveProperty("maxHp");
  });

  test("level (§2.6 hand-only) writes + clears via patchSheet — its ONLY write door", async () => {
    const { chatId, userId, service } = await seedGame();
    const ref = { kind: "user" as const, userId };
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    // Born null (nullable-honesty).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { className: "Fighter" } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBeNull();
    // Hand-set the level.
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { level: 4 } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBe(4);
    // Omit keeps it (MA-4).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { className: "Paladin" } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBe(4);
    // Explicit null clears it (key-presence, not ??).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { level: null } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBeNull();
  });

  test("an attribute key NOT in the profile is refused", async () => {
    const { chatId, userId, service } = await seedGame();
    await expect(
      service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: { kind: "user", userId }, patch: { attributes: { nonsense: 5 } } }),
    ).rejects.toThrow(UNKNOWN_ATTR_RE);
  });

  test("an attribute value out of range is refused", async () => {
    const { chatId, userId, service } = await seedGame();
    await expect(
      service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: { kind: "user", userId }, patch: { attributes: { str: 99 } } }),
    ).rejects.toThrow(RANGE_RE);
  });
});
