// verb: removeBook — owner-scoped delete. Load-bearing: the DB CASCADE clears the book's entries (entries
// have no independent existence); a foreign book is NotFound.

import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import { chatBooks, worldEntries } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { createDeleteReachCapture } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../../../../support/clock.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedChat, seedUser } from "../../_support.ts";

describe("removeBook", () => {
  test("deletes an owned book and cascades its entries", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Doomed" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    const res = await svc.removeBook({ principal: principal(owner), bookId: book.id });
    expect(res.deleted).toBe(true);
    const orphans = await db.select().from(worldEntries).where(eq(worldEntries.id, entry.id));
    expect(orphans).toHaveLength(0);
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.removeBook({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });

  // The entity→room bridge's DELETE residual (design §3.6): deleting a book CASCADEs its scope junctions, so a
  // post-write reach would reach no room whose pool read it. `removeBook` captures the reach PRE-write and fans
  // the captured set past its own success guard — wired here with the REAL composed capture over a live spy.
  test("deleting a chat-attached book fans roomEntityChanged to that room", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const svc = createWorldInfoService(makeHarness(db, { captureRoomReachForDelete: capture["world-info"] }).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Doomed" } });
    const room = await seedChat(db, "attached");
    await db.insert(chatBooks).values({ chatId: room, worldBookId: book.id, createdAt: FROZEN_AT_MS });

    await svc.removeBook({ principal: principal(owner), bookId: book.id });

    const fanned = captured.filter((e) => e.type === "roomEntityChanged" && e.entity === "world-info").map((e) => e.chatId);
    expect(fanned).toEqual([room]);
  });

  test("a foreign (NotFound) book delete fans NO room event — the thunk is past the guard", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const svc = createWorldInfoService(makeHarness(db, { captureRoomReachForDelete: capture["world-info"] }).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });
    const room = await seedChat(db, "attached");
    await db.insert(chatBooks).values({ chatId: room, worldBookId: theirs.id, createdAt: FROZEN_AT_MS });

    await expect(svc.removeBook({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    expect(captured).toEqual([]);
  });
});
