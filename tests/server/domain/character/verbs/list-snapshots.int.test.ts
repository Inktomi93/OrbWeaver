// verb: listSnapshots — browse history newest-first; owner-gated.

import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("listSnapshots", () => {
  test("returns snapshots newest-first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    const first = await svc.snapshot({
      principal: principal(owner),
      characterId: created.id,
      label: "a",
    });
    h.advance(1000);
    const second = await svc.snapshot({
      principal: principal(owner),
      characterId: created.id,
      label: "b",
    });

    const snaps = await svc.listSnapshots({ principal: principal(owner), characterId: created.id });
    expect(snaps.map((s) => s.id)).toEqual([second.id, first.id]);
  });

  test("listing another user's history throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await expect(svc.listSnapshots({ principal: principal(other), characterId: created.id })).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});
