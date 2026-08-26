// verb: listAttachmentsForBook — one owner-scoped reverse read for the book activation roster.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedPersona, seedUser } from "../../_support.ts";

describe("listAttachmentsForBook", () => {
  test("returns every character role and persona id for the owned book in one result", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const persona = await seedPersona(db, { ownerId: owner });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    await svc.attachToCharacter({ principal: principal(owner), characterId: character, bookId: book.id, role: "primary" });
    await svc.attachToPersona({ principal: principal(owner), personaId: persona, bookId: book.id });

    await expect(svc.listAttachmentsForBook({ principal: principal(owner), bookId: book.id })).resolves.toEqual({
      characters: [{ characterId: character, role: "primary" }],
      personaIds: [persona],
    });
  });

  test("a foreign book is NotFound and reveals no target ids", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const book = await svc.createBook({ principal: principal(other), input: { name: "Foreign" } });

    await expect(svc.listAttachmentsForBook({ principal: principal(owner), bookId: book.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
