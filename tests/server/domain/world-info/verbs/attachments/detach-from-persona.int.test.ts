// verb: detachFromPersona — idempotent removal. Load-bearing: detached:true then detached:false; a foreign
// persona is NotFound.

import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedPersona, seedUser } from "../../_support.ts";

describe("detachFromPersona", () => {
  test("removes the join, then is idempotent", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const persona = await seedPersona(db, { ownerId: owner });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    await svc.attachToPersona({ principal: principal(owner), personaId: persona, bookId: book.id });

    const first = await svc.detachFromPersona({
      principal: principal(owner),
      personaId: persona,
      bookId: book.id,
    });
    const second = await svc.detachFromPersona({
      principal: principal(owner),
      personaId: persona,
      bookId: book.id,
    });
    expect(first.detached).toBe(true);
    expect(second.detached).toBe(false);
  });

  test("a foreign persona is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await seedPersona(db, { ownerId: other });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await expect(
      svc.detachFromPersona({ principal: principal(owner), personaId: foreign, bookId: book.id }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
