// verb: remove — delete + best-effort avatar reap. Load-bearing: an owned delete reaps the avatar asset
// (FK is SET NULL, so the asset isn't FK-deleted), no character.updated emit fires (delete cascades the
// embedding), and not-owned throws.

import type { AssetId, CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes an owned character and reaps its avatar; no character.updated emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d", avatarAssetId: avatar },
    });
    h.events.length = 0;

    await svc.remove({ principal: principal(owner), characterId: created.id });

    await expect(svc.get({ principal: principal(owner), characterId: created.id })).rejects.toBeInstanceOf(CharacterNotFoundError);
    expect(h.reaps).toEqual([[avatar]]);
    expect(h.events).toEqual([]);
  });

  test("folds the freed expression-sprite assetIds into the avatar reap (expressions-design/01 §8)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d", avatarAssetId: avatar },
    });
    const spriteAsset1 = castId<AssetId>("asset_sprite_1");
    const spriteAsset2 = castId<AssetId>("asset_sprite_2");
    h.setSpriteReapResult([spriteAsset1, spriteAsset2]);

    await svc.remove({ principal: principal(owner), characterId: created.id });

    // The sprite-reap fired for this character, BEFORE the delete cascade could strand the ids.
    expect(h.spriteReaps).toEqual([created.id]);
    // avatar + both freed sprite assets reaped in ONE round-trip.
    expect(h.reaps).toEqual([[avatar, spriteAsset1, spriteAsset2]]);
  });

  test("a character with no avatar but with sprites reaps only the freed sprite assets", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    const spriteAsset = castId<AssetId>("asset_sprite_only");
    h.setSpriteReapResult([spriteAsset]);

    await svc.remove({ principal: principal(owner), characterId: created.id });

    expect(h.reaps).toEqual([[spriteAsset]]);
  });

  test("a character with no avatar deletes without a reap call", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    await svc.remove({ principal: principal(owner), characterId: created.id });
    expect(h.reaps).toEqual([]);
  });

  test("removing another user's character throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    await expect(svc.remove({ principal: principal(other), characterId: created.id })).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});
