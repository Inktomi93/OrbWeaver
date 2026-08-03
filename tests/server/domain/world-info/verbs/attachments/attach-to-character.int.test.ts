// verb: attachToCharacter — role-carrying attach + the primary-uniqueness belt (invariant #3). Load-bearing:
// attaching a SECOND primary atomically demotes the first (exactly one primary remains); both ownership gates
// fire (foreign character OR foreign book → NotFound); re-attach updates the role in place.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

describe("attachToCharacter", () => {
  test("a second primary demotes the first — exactly one primary remains", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const book1 = await svc.createBook({ principal: principal(owner), input: { name: "One" } });
    const book2 = await svc.createBook({ principal: principal(owner), input: { name: "Two" } });

    await svc.attachToCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: book1.id,
      role: "primary",
    });
    await svc.attachToCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: book2.id,
      role: "primary",
    });

    const attached = await svc.listForCharacter({
      principal: principal(owner),
      characterId: character,
    });
    const primaries = attached.filter((b) => b.role === "primary");
    expect(primaries.map((b) => b.id)).toEqual([book2.id]);
    expect(attached.find((b) => b.id === book1.id)?.role).toBe("auxiliary");
  });

  test("re-attaching updates the role in place (no duplicate row)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await svc.attachToCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: book.id,
      role: "auxiliary",
    });
    await svc.attachToCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: book.id,
      role: "primary",
    });

    const attached = await svc.listForCharacter({
      principal: principal(owner),
      characterId: character,
    });
    expect(attached).toHaveLength(1);
    expect(attached[0]?.role).toBe("primary");
  });

  test("a foreign character is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedCharacter(db, { ownerId: other });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await expect(
      svc.attachToCharacter({
        principal: principal(owner),
        characterId: foreign,
        bookId: book.id,
        role: "auxiliary",
      }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const character = await seedCharacter(db, { ownerId: owner });
    const theirBook = await svc.createBook({ principal: principal(other), input: { name: "T" } });

    await expect(
      svc.attachToCharacter({
        principal: principal(owner),
        characterId: character,
        bookId: theirBook.id,
        role: "auxiliary",
      }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
