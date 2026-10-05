// verb: listForChat — the room's attached books under the INJECTED member gate. Load-bearing:
// room-PUBLIC (not owner-filtered — another member's attached book is visible; the pool assembles against
// it either way); newest first; role null; a guard rejection propagates (a non-member never sees the list).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedChat, seedUser } from "../../_support.ts";

describe("listForChat", () => {
  test("the chat rack includes its runtime-derived inherited projection ahead of chat attachments", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const chatId = await seedChat(db);
    const harness = makeHarness(db, { requireChatMember: () => Promise.resolve(), requireChatHost: () => Promise.resolve() });
    const base = createWorldInfoService(harness.ctx);
    const global = await base.createBook({ principal: principal(host), input: { name: "Inherited global" } });
    const direct = await base.createBook({ principal: principal(host), input: { name: "Direct" } });
    await base.attachToChat({ principal: principal(host), chatId, bookId: direct.id });
    const ctx = {
      ...harness.ctx,
      readInheritedChatBooks: () => Promise.resolve([{ ...global, role: null, inherited: { source: "global" as const, name: null } }]),
    };
    const svc = createWorldInfoService(ctx);
    expect((await svc.listForChat({ principal: principal(host), chatId, includeInherited: true })).map((book) => book.name)).toEqual([
      "Inherited global",
      "Direct",
    ]);
  });
  test("member list is room-public: another user's attached book is visible; role null; newest first", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, {
      requireChatHost: () => Promise.resolve(),
      requireChatMember: () => Promise.resolve(),
      readInheritedChatBooks: () => Promise.resolve([]),
    });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    const older = await svc.createBook({ principal: principal(host), input: { name: "older" } });
    await svc.attachToChat({ principal: principal(host), chatId, bookId: older.id });
    harness.advance(1000);
    const newer = await svc.createBook({ principal: principal(host), input: { name: "newer" } });
    await svc.attachToChat({ principal: principal(host), chatId, bookId: newer.id });

    // The MEMBER (who owns neither book) sees the room's full pool, newest first.
    const listed = await svc.listForChat({ principal: principal(member), chatId });
    expect(listed.map((b) => b.id)).toEqual([newer.id, older.id]);
    expect(listed.every((b) => b.role === null)).toBe(true);
  });

  test("a chat-guard rejection propagates (a non-member never sees the list)", async () => {
    const db = await freshDb();
    const refusal = new Error("chat_not_found");
    const harness = makeHarness(db, { requireChatMember: () => Promise.reject(refusal) });
    const svc = createWorldInfoService(harness.ctx);
    const outsider = await seedUser(db, { handle: castId<Handle>("outsider") });
    const chatId = await seedChat(db);

    await expect(svc.listForChat({ principal: principal(outsider), chatId })).rejects.toBe(refusal);
  });
});
