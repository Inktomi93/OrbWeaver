// Mirror int-test for the two SINGLE-BOOK doors on `WorldInfoService` (F2 — the export/import verbs were
// BUILT and had ZERO doors, so sharing one lorebook required a full library-zip round-trip through the
// backup pane, and agents inspecting the domain reported the feature as finished).
//
// The doors are THIN ARMS over the same two verbs the bundle descriptor composes (the ratified thin-arm
// law), so what this pins is that the arms genuinely delegate: the exported bytes re-import through the
// SAME dedupe-by-name semantics the bundle uses, and a refusal carries the operator words the import
// dialog renders (including the case the old uniform copy hid — a book from a NEWER orbweaver).

import { worldBooks } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { WORLD_INFO_SCHEMA_KIND } from "@orb/server/kit/serde/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { makeHarness, principal, seedUser } from "./_support.ts";

const DEC = new TextDecoder();

describe("the single-book doors", () => {
  test("export -> import round-trips a book onto ANOTHER account (the sharing path F2 was missing)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const author = await seedUser(db, { handle: castId<Handle>("author") });
    const friend = await seedUser(db, { handle: castId<Handle>("friend") });

    const book = await svc.createBook({ principal: principal(author), input: { name: "Aria's World", description: "the lore" } });
    await svc.createEntry({
      principal: principal(author),
      bookId: book.id,
      input: { title: "The Kingdom", content: "A realm of eternal dusk.", keys: ["kingdom"] },
    });

    const file = await svc.exportBook({ principal: principal(author), bookId: book.id });
    if (file === null) {
      throw new Error("exportBook returned null for an owned book");
    }
    expect(file.filename).toBe("aria-s-world.json");
    expect(DEC.decode(file.bytes)).toContain(WORLD_INFO_SCHEMA_KIND);

    const outcome = await svc.importFile({ principal: principal(friend), fileText: DEC.decode(file.bytes) });

    expect(outcome.ok).toBe(true);
    expect(outcome.created).toBe(true);
    const landed = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, friend));
    expect(landed.map((r) => r.name)).toEqual(["Aria's World"]);
    // …and the entries came with it (the whole point of sharing a lorebook).
    const restored = landed[0]?.id;
    const entries = restored === undefined ? [] : await svc.listEntries({ principal: principal(friend), bookId: restored });
    expect(entries.map((e) => e.title)).toEqual(["The Kingdom"]);
  });

  test("a same-named re-import MERGES in place — the door inherits the bundle's dedupe, never its own", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Solo" } });
    const file = await svc.exportBook({ principal: principal(owner), bookId: book.id });
    if (file === null) {
      throw new Error("exportBook returned null");
    }

    const again = await svc.importFile({ principal: principal(owner), fileText: DEC.decode(file.bytes) });

    expect(again.ok).toBe(true);
    expect(again.created).toBe(false);
    expect(await db.select().from(worldBooks).where(eq(worldBooks.ownerId, owner))).toHaveLength(1);
  });

  test("a foreign / absent book exports as null (the leak-free owner gate reaches the door)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirs = await svc.createBook({ principal: principal(stranger), input: { name: "Theirs" } });

    expect(await svc.exportBook({ principal: principal(owner), bookId: theirs.id })).toBeNull();
  });

  test("a refused file carries the REASON as words — a newer-orbweaver book is not 'not a valid file'", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const garbage = await svc.importFile({ principal: principal(owner), fileText: "{not json" });
    expect(garbage.ok).toBe(false);
    expect(garbage.error).toContain("not JSON");

    const future = JSON.stringify({ schemaKind: WORLD_INFO_SCHEMA_KIND, schemaVersion: 99, name: "Future", description: null, entries: [] });
    const newer = await svc.importFile({ principal: principal(owner), fileText: future });
    expect(newer.error).toContain("newer version of orbweaver");

    expect(await db.select().from(worldBooks).where(eq(worldBooks.ownerId, owner))).toHaveLength(0);
  });
});
