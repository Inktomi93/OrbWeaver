// verb: detachFromPersona — idempotent removal. Load-bearing: detached:true then detached:false; a foreign
// persona is NotFound.
// @subject packages/server/src/domain/world-info/verbs/attachments/detach-from-persona.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createWorldInfoService, WorldInfoNotFoundError } from "#server/domain/world-info/index.ts";
import { makeHarness, principal, seedPersona, seedUser } from "../../_support.ts";

describe("detachFromPersona", () => {
  test("removes the join, then is idempotent", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const persona = await seedPersona(db, { ownerId: owner });
    const book = await svc.createBook({ principal: await principal(db, owner), input: { name: "B" } });
    await svc.attachToPersona({ principal: await principal(db, owner), personaId: persona, bookId: book.id });

    const first = await svc.detachFromPersona({
      principal: await principal(db, owner),
      personaId: persona,
      bookId: book.id,
    });
    const second = await svc.detachFromPersona({
      principal: await principal(db, owner),
      personaId: persona,
      bookId: book.id,
    });
    expect(first.detached).toBe(true);
    expect(second.detached).toBe(false);
  });

  test("a foreign persona is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedPersona(db, { ownerId: other });
    const book = await svc.createBook({ principal: await principal(db, owner), input: { name: "B" } });

    await expect(svc.detachFromPersona({ principal: await principal(db, owner), personaId: foreign, bookId: book.id })).rejects.toBeInstanceOf(
      WorldInfoNotFoundError,
    );
  });
});
