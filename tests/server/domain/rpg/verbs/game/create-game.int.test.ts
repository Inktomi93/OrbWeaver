// verbs/game/create-game — createGame (rpg-design/05 §4.4, §6.2). Pins the knob default-identity (`gmPresetId`
// NULL, `extractionMode` "folded"), the `createGame("full")` → RpgModeUnbuilt PHASE refusal, the
// pointer-fired-once assertion, and the authority arms — all asserted at the ROW (assert-the-mutation-fired).

import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findGameByChat } from "../../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../../support/db";
import { expect, makeRpgService, principal, seedChat, test } from "../../_support";

const FULL_UNBUILT_RE = /full mode is not built/i;
const ALREADY_GAME_RE = /already a game/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("createGame", () => {
  test("mints a lite game with the knob defaults + fires the pointer once", async () => {
    const chatId = await seedChat(db, "a");
    const { service, fakes } = makeRpgService(db);
    fakes.membership.set("user_host", "host");

    const result = await service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" });

    const game = await findGameByChat(db, chatId);
    expect(game?.mode).toBe("lite");
    expect(game?.status).toBe("active");
    expect(game?.gmPresetId).toBeNull(); // the knob's lite default = augment
    expect(game?.config.extractionMode).toBe("folded"); // BORN folded — the contract owns the default, never a re-spell at mint
    expect(fakes.pointers).toEqual([{ chatId, gameId: result.gameId, engaged: true }]); // fired EXACTLY once, born engaged (#40)
    expect(result.trackersReadOnly).toBe(false);
    // §4.9: createGame emits `gameChanged` after the row write (the takeover/config reads refetch).
    expect(fakes.busEvents).toEqual([{ type: "gameChanged", chatId }]);
  });

  test('createGame("full") throws the RpgModeUnbuilt PHASE refusal — and mints nothing', async () => {
    const chatId = await seedChat(db, "a");
    const { service, fakes } = makeRpgService(db);
    fakes.membership.set("user_host", "host");

    await expect(service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "full" })).rejects.toThrow(FULL_UNBUILT_RE);
    expect(await findGameByChat(db, chatId)).toBeUndefined();
    expect(fakes.pointers).toEqual([]);
    expect(fakes.busEvents).toEqual([]); // a refused create emits nothing
  });

  test("a caller-picked packaged profile is stored on the config", async () => {
    const chatId = await seedChat(db, "a");
    const { service, fakes } = makeRpgService(db);
    fakes.membership.set("user_host", "host");
    await service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite", profile: RPG_PROFILE_D20 });
    const game = await findGameByChat(db, chatId);
    expect(game?.config.statProfile.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
  });

  test("a non-host member is FORBIDDEN; a non-member gets the leak-free NOT-FOUND collapse", async () => {
    const chatId = await seedChat(db, "a");
    const { service, fakes } = makeRpgService(db);
    fakes.membership.set("user_member", "member");
    // A present member reaching the host-only create is FORBIDDEN (they know the chat exists — the action is gated).
    await expect(service.createGame({ principal: principal(castId<Handle>("member")), chatId, mode: "lite" })).rejects.toThrow(DomainForbiddenError);
    // A NON-MEMBER collapses to the SAME leak-free NOT-FOUND a no-game chat gives (guard.ts's cross-tenant boundary —
    // never a distinguishable BAD_REQUEST that would confirm the chat is real). Mirrors the authority.suite ghost arms.
    await expect(service.createGame({ principal: principal(castId<Handle>("stranger")), chatId, mode: "lite" })).rejects.toThrow(DomainNotFoundError);
    expect(await findGameByChat(db, chatId)).toBeUndefined();
  });

  test("a second createGame on the same chat refuses (one game per chat)", async () => {
    const chatId = await seedChat(db, "a");
    const { service, fakes } = makeRpgService(db);
    fakes.membership.set("user_host", "host");
    await service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" });
    await expect(service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" })).rejects.toThrow(ALREADY_GAME_RE);
  });
});
