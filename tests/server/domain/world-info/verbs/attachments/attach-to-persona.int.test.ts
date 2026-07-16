// verb: attachToPersona — the persona-book join. Load-bearing: both ownership gates fire (foreign persona OR
// foreign book → NotFound); idempotent; the book then appears in listForPersona with role null.

import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedPersona, seedUser } from "../../_support.ts";

describe("attachToPersona", () => {
  test("joins book↔persona (idempotent), role null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const persona = await seedPersona(db, { ownerId: owner });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await svc.attachToPersona({ principal: principal(owner), personaId: persona, bookId: book.id });
    await svc.attachToPersona({ principal: principal(owner), personaId: persona, bookId: book.id });

    const listed = await svc.listForPersona({ principal: principal(owner), personaId: persona });
    expect(listed.map((b) => b.id)).toEqual([book.id]);
    expect(listed[0]?.role).toBeNull();
  });

  test("a foreign persona is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await seedPersona(db, { ownerId: other });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await expect(svc.attachToPersona({ principal: principal(owner), personaId: foreign, bookId: book.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const persona = await seedPersona(db, { ownerId: owner });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "T" } });

    await expect(svc.attachToPersona({ principal: principal(owner), personaId: persona, bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
