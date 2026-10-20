// verb: listForPersona — the caller's persona-attached books, newest first, role null. Load-bearing: a
// foreign persona is NotFound; only the joined books surface.
// @subject packages/server/src/domain/world-info/verbs/attachments/list-for-persona.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createWorldInfoService, WorldInfoNotFoundError } from "#server/domain/world-info/index.ts";
import { makeHarness, principal, seedPersona, seedUser } from "../../_support.ts";

describe("listForPersona", () => {
  test("returns the persona's joined books, role null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const persona = await seedPersona(db, { ownerId: owner });
    const joined = await svc.createBook({ principal: await principal(db, owner), input: { name: "J" } });
    await svc.createBook({ principal: await principal(db, owner), input: { name: "Unjoined" } });
    await svc.attachToPersona({
      principal: await principal(db, owner),
      personaId: persona,
      bookId: joined.id,
    });

    const listed = await svc.listForPersona({ principal: await principal(db, owner), personaId: persona });
    expect(listed.map((b) => b.id)).toEqual([joined.id]);
    expect(listed[0]?.role).toBeNull();
  });

  test("a foreign persona is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedPersona(db, { ownerId: other });

    await expect(svc.listForPersona({ principal: await principal(db, owner), personaId: foreign })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
