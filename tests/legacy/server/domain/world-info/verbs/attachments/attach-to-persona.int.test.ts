// verb: attachToPersona — the persona-book join. Load-bearing: both ownership gates fire (foreign persona OR
// foreign book → NotFound); idempotent; the book then appears in listForPersona with role null.
// @subject packages/server/src/domain/world-info/verbs/attachments/attach-to-persona.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createWorldInfoService, WorldInfoNotFoundError } from "#server/domain/world-info/index.ts";
import { makeHarness, principal, seedPersona, seedUser } from "../../_support.ts";

describe("attachToPersona", () => {
  test("joins book↔persona (idempotent), role null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const persona = await seedPersona(db, { ownerId: owner });
    const book = await svc.createBook({ principal: await principal(db, owner), input: { name: "B" } });

    await svc.attachToPersona({ principal: await principal(db, owner), personaId: persona, bookId: book.id });
    await svc.attachToPersona({ principal: await principal(db, owner), personaId: persona, bookId: book.id });

    const listed = await svc.listForPersona({ principal: await principal(db, owner), personaId: persona });
    expect(listed.map((b) => b.id)).toEqual([book.id]);
    expect(listed[0]?.role).toBeNull();
  });

  test("a foreign persona is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedPersona(db, { ownerId: other });
    const book = await svc.createBook({ principal: await principal(db, owner), input: { name: "B" } });

    await expect(svc.attachToPersona({ principal: await principal(db, owner), personaId: foreign, bookId: book.id })).rejects.toBeInstanceOf(
      WorldInfoNotFoundError,
    );
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const persona = await seedPersona(db, { ownerId: owner });
    const theirs = await svc.createBook({ principal: await principal(db, other), input: { name: "T" } });

    await expect(svc.attachToPersona({ principal: await principal(db, owner), personaId: persona, bookId: theirs.id })).rejects.toBeInstanceOf(
      WorldInfoNotFoundError,
    );
  });
});
