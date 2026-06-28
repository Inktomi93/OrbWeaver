// verb: remove — delete + best-effort avatar reap. Load-bearing: an owned delete reaps the avatar asset
// (FK is SET NULL, so the asset isn't FK-deleted), no character.updated emit fires (delete cascades the
// embedding), and not-owned throws.

import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes an owned character and reaps its avatar; no character.updated emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { ownerId: owner });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d", avatarAssetId: avatar },
    });
    h.events.length = 0;

    await svc.remove({ principal: principal(owner), characterId: created.id });

    await expect(
      svc.get({ principal: principal(owner), characterId: created.id }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
    expect(h.reaps).toEqual([[avatar]]);
    expect(h.events).toEqual([]);
  });

  test("a character with no avatar deletes without a reap call", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await svc.remove({ principal: principal(owner), characterId: created.id });
    expect(h.reaps).toEqual([]);
  });

  test("removing another user's character throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await expect(
      svc.remove({ principal: principal(other), characterId: created.id }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});
