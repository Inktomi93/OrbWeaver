// tests/server/domain/rpg/verbs/detach-dangling-pointer — the dangling-pointer HEAL (fork-clones-the-game §3.3).
// A chat's `metadata.rpg` pointer can point at a game row that no longer exists (a pre-fix fork made before W-F
// cloned the game, or any future desync). That dangle makes `getGame` 404 and the panel crash. Two arms proven:
//   • getGame ON A DANGLING POINTER collapses to the TYPED leak-free NOT_FOUND (`DomainNotFoundError`), NEVER a
//     500 — the client can discriminate "the game is gone" from "the server broke";
//   • `detachDanglingPointer` is HOST-gated and nulls the stale pointer (the widened `setPointer(chatId, null)`),
//     refuses a LIVE game, refuses a member (FORBIDDEN), and collapses a non-member to leak-free NOT_FOUND.
//
// The verb CANNOT use the normal game gate (the game is gone → `resolveMember` would 404 on the healable state
// itself); it gates on `getMembership` DIRECTLY. The harness's `getMembership` fake is programmed per case.

import type { Db } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import { freshDb } from "../../../../../support/db";
import { expect, makeRpgService, principal, seedChat, seedUser, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** A chat with a HOST membership but NO game row — the exact dangling-pointer state (the pointer would live on
 *  `chats.metadata.rpg`, but `rpg_games` has nothing for it). */
async function seedDanglingChat(): Promise<{ chatId: ChatId; h: ReturnType<typeof makeRpgService> }> {
  const chatId = await seedChat(db, "dangling");
  await seedUser(db, castId<Handle>("host"));
  await seedUser(db, castId<Handle>("member"));
  const h = makeRpgService(db);
  h.fakes.membership.set("user_host", "host");
  h.fakes.membership.set("user_member", "member");
  // Deliberately NO createGame — the pointer dangles at a game that never exists here.
  return { chatId, h };
}

test("getGame on a dangling pointer is a TYPED NOT_FOUND, never a 500", async () => {
  const { chatId, h } = await seedDanglingChat();
  // A host reads a chat whose game row is gone: the read collapses to the same leak-free NOT_FOUND a no-game
  // chat gets — a DomainNotFoundError, which transport maps to NOT_FOUND (the client discriminates it).
  await expect(h.service.getGame({ principal: principal(castId<Handle>("host")), chatId })).rejects.toThrow(DomainNotFoundError);
});

test("host detaches the dangling pointer — nulls the pointer (the §3.3 heal)", async () => {
  const { chatId, h } = await seedDanglingChat();
  await h.service.detachDanglingPointer({ principal: principal(castId<Handle>("host")), chatId });
  // The widened `setPointer(chatId, null)` fired: the fake records the DETACH (never a normal pointer write).
  expect(h.fakes.detaches).toEqual([chatId]);
  expect(h.fakes.pointers).toHaveLength(0);
});

test("a MEMBER is FORBIDDEN (host-only heal)", async () => {
  const { chatId, h } = await seedDanglingChat();
  await expect(h.service.detachDanglingPointer({ principal: principal(castId<Handle>("member")), chatId })).rejects.toThrow(DomainForbiddenError);
  expect(h.fakes.detaches).toHaveLength(0);
});

test("a NON-MEMBER collapses to leak-free NOT_FOUND", async () => {
  const { chatId, h } = await seedDanglingChat();
  await expect(h.service.detachDanglingPointer({ principal: principal(castId<Handle>("ghost")), chatId })).rejects.toThrow(DomainNotFoundError);
  expect(h.fakes.detaches).toHaveLength(0);
});

test("a LIVE game is REFUSED — detach only heals a genuinely-gone game", async () => {
  const chatId = await seedChat(db, "live");
  await seedUser(db, castId<Handle>("host"));
  const h = makeRpgService(db);
  h.fakes.membership.set("user_host", "host");
  // A REAL game exists for this chat — the pointer is NOT dangling, so the host detach is refused.
  await h.service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" });
  await expect(h.service.detachDanglingPointer({ principal: principal(castId<Handle>("host")), chatId })).rejects.toThrow(DomainOperationError);
  expect(h.fakes.detaches).toHaveLength(0);
});
