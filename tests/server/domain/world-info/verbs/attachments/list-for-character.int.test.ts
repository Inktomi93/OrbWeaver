// verb: listForCharacter — attachments of an owned character, primary first then newest, carrying the role.
// Load-bearing: ordering (primary before auxiliary); the role is surfaced; a foreign character is NotFound.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

describe("listForCharacter", () => {
  test("returns attachments primary-first, carrying the role", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const aux = await svc.createBook({ principal: principal(owner), input: { name: "Aux" } });
    const prim = await svc.createBook({ principal: principal(owner), input: { name: "Prim" } });
    await svc.attachToCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: aux.id,
      role: "auxiliary",
    });
    await svc.attachToCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: prim.id,
      role: "primary",
    });

    const listed = await svc.listForCharacter({
      principal: principal(owner),
      characterId: character,
    });
    expect(listed.map((b) => b.id)).toEqual([prim.id, aux.id]);
    expect(listed[0]?.role).toBe("primary");
    expect(listed[1]?.role).toBe("auxiliary");
  });

  test("a foreign character is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedCharacter(db, { ownerId: other });

    await expect(svc.listForCharacter({ principal: principal(owner), characterId: foreign })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
