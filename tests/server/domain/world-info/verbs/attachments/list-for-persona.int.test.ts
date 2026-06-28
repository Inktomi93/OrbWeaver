// verb: listForPersona — the caller's persona-attached books, newest first, role null. Load-bearing: a
// foreign persona is NotFound; only the joined books surface.

import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { makeHarness, principal, seedPersona, seedUser } from "../../_support.ts";

describe("listForPersona", () => {
  test("returns the persona's joined books, role null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const persona = await seedPersona(db, { ownerId: owner });
    const joined = await svc.createBook({ principal: principal(owner), input: { name: "J" } });
    await svc.createBook({ principal: principal(owner), input: { name: "Unjoined" } });
    await svc.attachToPersona({
      principal: principal(owner),
      personaId: persona,
      bookId: joined.id,
    });

    const listed = await svc.listForPersona({ principal: principal(owner), personaId: persona });
    expect(listed.map((b) => b.id)).toEqual([joined.id]);
    expect(listed[0]?.role).toBeNull();
  });

  test("a foreign persona is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await seedPersona(db, { ownerId: other });

    await expect(
      svc.listForPersona({ principal: principal(owner), personaId: foreign }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
