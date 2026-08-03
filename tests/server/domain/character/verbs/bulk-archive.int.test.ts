// verb: bulkArchive — owner-scoped archive/un-archive flip; foreign rows are untouched; no emit.

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("bulkArchive", () => {
  test("archives owned characters and leaves other owners' rows alone; no emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    const foreign = await svc.create({
      principal: principal(other),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" },
    });
    h.events.length = 0;

    await svc.bulkArchive({
      principal: principal(owner),
      characterIds: [a.id, foreign.id],
      archived: true,
    });

    const owned = await svc.get({ principal: principal(owner), characterId: a.id });
    const foreignRow = await svc.get({ principal: principal(other), characterId: foreign.id });
    expect(owned.archived).toBe(true);
    expect(foreignRow.archived).toBe(false);
    expect(h.events).toEqual([]);
  });

  test("un-archive flips back", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    await svc.bulkArchive({ principal: principal(owner), characterIds: [a.id], archived: true });
    await svc.bulkArchive({ principal: principal(owner), characterIds: [a.id], archived: false });
    const row = await svc.get({ principal: principal(owner), characterId: a.id });
    expect(row.archived).toBe(false);
  });
});
