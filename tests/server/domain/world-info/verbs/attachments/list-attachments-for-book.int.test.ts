// verb: listAttachmentsForBook — one owner-scoped reverse read for the book activation roster.

import { characterBooks, personaBooks } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../../../../support/clock.ts";
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

  // The TARGET end of the scope. `loadOwnedBook` proves only the BOOK; the junction rows may name a
  // character or persona owned by someone else (the `handoff-copy-write` header states such cross-owner
  // junctions exist in practice). Ownership is INHERITED through the FK chain (D18), so the target join
  // carries the caller's ownerId too — otherwise the roster hands the caller a stranger's entity ids.
  test("a FOREIGN character/persona junction on an owned book is NOT disclosed (owned targets still are)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mineCharacter = await seedCharacter(db, { id: "character_mine", ownerId: owner });
    const minePersona = await seedPersona(db, { id: "persona_mine", ownerId: owner });
    const theirCharacter = await seedCharacter(db, { id: "character_theirs", ownerId: stranger });
    const theirPersona = await seedPersona(db, { id: "persona_theirs", ownerId: stranger });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    await svc.attachToCharacter({ principal: principal(owner), characterId: mineCharacter, bookId: book.id, role: "primary" });
    await svc.attachToPersona({ principal: principal(owner), personaId: minePersona, bookId: book.id });
    // Planted directly: the verbs gate both ends, but the handoff/carry write paths can leave a junction
    // whose TARGET belongs to another owner.
    await db.insert(characterBooks).values({ characterId: theirCharacter, worldBookId: book.id, role: "auxiliary", createdAt: FROZEN_AT_MS });
    await db.insert(personaBooks).values({ personaId: theirPersona, worldBookId: book.id, createdAt: FROZEN_AT_MS });

    const targets = await svc.listAttachmentsForBook({ principal: principal(owner), bookId: book.id });

    expect(targets).toEqual({ characters: [{ characterId: mineCharacter, role: "primary" }], personaIds: [minePersona] });
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
