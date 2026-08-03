// verbs/entries — PD-89 fan-out. A `.suite.int.test.ts` (not a 1:1 mirror — test-layout gate exemption): the
// behavior under test spans THREE source modules (create/update/remove.ts), all fanning the SAME
// `listChatIdsForBook` query, not one module in isolation.
//
// Load-bearing: `create`/`update`/`remove` each fan `wiEntry*` over EVERY chat the entry's book is attached
// to, and emit NOTHING when the book is attached to zero chats (empty fan-out is correct, not an error — the
// chat-scope-only rule in contracts/world-info). `update` only fires `wiEntryScopeChanged` when the edit
// touches a scope/activation field (keys/enabled/metadata); a content-only edit is silent, mirroring the
// attachment verbs' "only a REAL change emits" rule.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedChat, seedUser } from "../../_support.ts";

describe("entry verbs — PD-89 wiEntry* fan-out", () => {
  test("createEntry fans wiEntryAttached over every chat the book is attached to", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await svc.attachToChat({ principal: principal(owner), chatId: chatA, bookId: book.id });
    await svc.attachToChat({ principal: principal(owner), chatId: chatB, bookId: book.id });
    harness.wiEvents.length = 0; // drop the two wiBookAttached emits from the setup above

    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c", keys: ["castle"] },
    });

    expect(harness.wiEvents).toEqual([
      {
        type: "wiEntryAttached",
        chatId: chatA,
        surface: "chat",
        entryId: entry.id,
        scope: "keyword",
      },
      {
        type: "wiEntryAttached",
        chatId: chatB,
        surface: "chat",
        entryId: entry.id,
        scope: "keyword",
      },
    ]);
  });

  test("createEntry on a book attached to zero chats emits nothing", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    expect(harness.wiEvents).toEqual([]);
  });

  test("removeEntry fans wiEntryDetached over every attached chat", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await svc.attachToChat({ principal: principal(owner), chatId: chatA, bookId: book.id });
    await svc.attachToChat({ principal: principal(owner), chatId: chatB, bookId: book.id });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });
    harness.wiEvents.length = 0; // drop the attach + create emits above

    await svc.removeEntry({ principal: principal(owner), entryId: entry.id });

    expect(harness.wiEvents).toEqual([
      { type: "wiEntryDetached", chatId: chatA, surface: "chat", entryId: entry.id },
      { type: "wiEntryDetached", chatId: chatB, surface: "chat", entryId: entry.id },
    ]);
  });

  test("removeEntry on a book attached to zero chats emits nothing", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    await svc.removeEntry({ principal: principal(owner), entryId: entry.id });

    expect(harness.wiEvents).toEqual([]);
  });

  test("updateEntry fans wiEntryScopeChanged over every attached chat on a keys edit", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await svc.attachToChat({ principal: principal(owner), chatId: chatA, bookId: book.id });
    await svc.attachToChat({ principal: principal(owner), chatId: chatB, bookId: book.id });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" }, // no keys → always-scope
    });
    harness.wiEvents.length = 0; // drop the attach + create emits above

    await svc.updateEntry({
      principal: principal(owner),
      entryId: entry.id,
      input: { keys: ["dragon"] },
    });

    expect(harness.wiEvents).toEqual([
      {
        type: "wiEntryScopeChanged",
        chatId: chatA,
        surface: "chat",
        entryId: entry.id,
        scope: "keyword",
      },
      {
        type: "wiEntryScopeChanged",
        chatId: chatB,
        surface: "chat",
        entryId: entry.id,
        scope: "keyword",
      },
    ]);
  });

  test("updateEntry on a content-only edit emits nothing (no scope/activation field touched)", async () => {
    const db = await freshDb();
    const harness = makeHarness(db, { requireChatHost: () => Promise.resolve() });
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const chatId = await seedChat(db);
    await svc.attachToChat({ principal: principal(owner), chatId, bookId: book.id });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "old" },
    });
    harness.wiEvents.length = 0; // drop the attach + create emits above

    await svc.updateEntry({
      principal: principal(owner),
      entryId: entry.id,
      input: { content: "new" },
    });

    expect(harness.wiEvents).toEqual([]);
  });

  test("updateEntry on a book attached to zero chats emits nothing even on a scope-affecting edit", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createWorldInfoService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    await svc.updateEntry({
      principal: principal(owner),
      entryId: entry.id,
      input: { enabled: false },
    });

    expect(harness.wiEvents).toEqual([]);
  });
});
