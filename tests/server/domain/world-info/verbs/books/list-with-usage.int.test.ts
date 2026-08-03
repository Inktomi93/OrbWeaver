// verb: listBooksWithUsage — the roster read's two derived numbers: the entry count and the four-scope
// attachment rollup. Load-bearing: the rollup is keyed to the CALLER's book ids (a stranger's attachments
// never inflate a count), `global` is a flag that still counts as one attachment in `total`, and a book
// nobody attached reads as a true zero rather than an absent key.

import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedPersona, seedUser } from "../../_support.ts";

describe("listBooksWithUsage", () => {
  test("counts entries and rolls up the character/persona/global scopes, global counting as one", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, { ownerId: owner });
    const personaId = await seedPersona(db, { ownerId: owner });

    const book = await svc.createBook({ principal: principal(owner), input: { name: "Reach" } });
    await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "One", content: "a" } });
    await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "Two", content: "b" } });
    await svc.attachToCharacter({ principal: principal(owner), characterId, bookId: book.id, role: "auxiliary" });
    await svc.attachToPersona({ principal: principal(owner), personaId, bookId: book.id });
    await svc.attachGlobal({ principal: principal(owner), bookId: book.id });

    const [row] = await svc.listBooksWithUsage({ principal: principal(owner) });
    expect(row?.entryCount).toBe(2);
    expect(row?.usage).toEqual({ characters: 1, personas: 1, chats: 0, global: true, total: 3 });
  });

  test("an untouched book reads as zeros, and another owner's attachments never leak into the rollup", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirCharacter = await seedCharacter(db, { id: "character_other", ownerId: other });

    const mine = await svc.createBook({ principal: principal(owner), input: { name: "Mine" } });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });
    await svc.attachToCharacter({ principal: principal(other), characterId: theirCharacter, bookId: theirs.id, role: "auxiliary" });

    const rows = await svc.listBooksWithUsage({ principal: principal(owner) });
    expect(rows.map((b) => b.id)).toEqual([mine.id]);
    expect(rows[0]?.entryCount).toBe(0);
    expect(rows[0]?.usage).toEqual({ characters: 0, personas: 0, chats: 0, global: false, total: 0 });
  });
});
