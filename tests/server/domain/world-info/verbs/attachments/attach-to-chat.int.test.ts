// verb: attachToChat (PD-30) — the chat-book join. Load-bearing: the INJECTED `requireChatHost` gate fires
// (a guard rejection propagates and NOTHING writes/emits/audits); the book ownership gate fires (a foreign
// book is NotFound); idempotent on the composite key — only the REAL insert emits `wiBookAttached` + audits
// (a re-attach is silent: no phantom pool-invalidation event, no duplicate audit row).

import { chatBooks } from "@orb/db";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedChat, seedUser } from "../../_support.ts";

describe("attachToChat", () => {
  test("host attach joins book↔chat (idempotent) — ONE wiBookAttached emit + ONE audit", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: "host" });
    const chatId = await seedChat(db);
    const book = await svc.createBook({ principal: principal(host), input: { name: "B" } });
    harness.userEvents.length = 0; // drop createBook's own worldInfoChanged — assert only the attach's.

    await svc.attachToChat({ principal: principal(host), chatId, bookId: book.id });
    await svc.attachToChat({ principal: principal(host), chatId, bookId: book.id });

    const rows = await db.select().from(chatBooks);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.worldBookId).toBe(book.id);
    // Only the REAL insert emits + audits — the idempotent re-attach is silent.
    expect(harness.wiEvents).toEqual([
      { type: "wiBookAttached", chatId, surface: "chat", bookId: book.id },
    ]);
    expect(harness.audits.filter((a) => a.entry.action === "worldInfo.attachToChat")).toHaveLength(
      1,
    );
    // The user-bus freshness emit fires ONCE (the real insert only) to the acting host / book owner.
    expect(harness.userEvents).toEqual([
      { userId: host, event: { type: "worldInfoChanged", bookId: book.id } },
    ]);
  });

  test("a chat-guard rejection propagates — nothing writes, emits, or audits", async () => {
    const db = await freshDb();
    const refusal = new Error("not_host");
    const harness = makeHarness(db, { requireChatHost: () => Promise.reject(refusal) });
    const svc = createWorldInfoService(harness.ctx);
    const member = await seedUser(db, { handle: "member" });
    const chatId = await seedChat(db);
    const book = await svc.createBook({ principal: principal(member), input: { name: "B" } });

    await expect(
      svc.attachToChat({ principal: principal(member), chatId, bookId: book.id }),
    ).rejects.toBe(refusal);
    expect(await db.select().from(chatBooks)).toHaveLength(0);
    expect(harness.wiEvents).toEqual([]);
    expect(harness.audits.some((a) => a.entry.action === "worldInfo.attachToChat")).toBe(false);
  });

  test("a foreign book is NotFound (the host shares only THEIR book)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const host = await seedUser(db, { handle: "host" });
    const other = await seedUser(db, { handle: "other" });
    const chatId = await seedChat(db);
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "T" } });

    await expect(
      svc.attachToChat({ principal: principal(host), chatId, bookId: theirs.id }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    expect(harness.wiEvents).toEqual([]);
  });
});
