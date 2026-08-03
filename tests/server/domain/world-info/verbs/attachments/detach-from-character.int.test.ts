// verb: detachFromCharacter — idempotent removal. Load-bearing: removing an existing attachment returns
// detached:true; detaching when absent is detached:false (no error); a foreign character is NotFound.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

describe("detachFromCharacter", () => {
  test("removes an attachment, then is idempotent", async () => {
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

    const first = await svc.detachFromCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: book.id,
    });
    const second = await svc.detachFromCharacter({
      principal: principal(owner),
      characterId: character,
      bookId: book.id,
    });
    expect(first.detached).toBe(true);
    expect(second.detached).toBe(false);
  });

  test("a foreign character is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedCharacter(db, { ownerId: other });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    await expect(
      svc.detachFromCharacter({
        principal: principal(owner),
        characterId: foreign,
        bookId: book.id,
      }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
