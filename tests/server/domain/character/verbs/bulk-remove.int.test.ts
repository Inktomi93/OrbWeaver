// verb: bulkRemove — delete many owned; skip missing/foreign (don't throw); reap avatars once.

import type { CharacterHandle, CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("bulkRemove", () => {
  test("deletes owned ids, skips foreign/missing, and reaps once", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const avatarA = await seedAsset(db, { id: "asset_a", ownerId: owner, hash: "avatar-a" });
    const avatarB = await seedAsset(db, { id: "asset_b", ownerId: owner, hash: "avatar-b" });
    const foreignAvatar = await seedAsset(db, { id: "asset_foreign", ownerId: other, hash: "foreign-avatar" });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d", avatarAssetId: avatarA },
    });
    const b = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d", avatarAssetId: avatarB },
    });
    const foreign = await svc.create({
      principal: principal(other),
      input: { handle: castId<CharacterHandle>("c"), name: "C", description: "d", avatarAssetId: foreignAvatar },
    });

    await svc.bulkRemove({
      principal: principal(owner),
      characterIds: [a.id, b.id, foreign.id, castId<CharacterId>("character_ghost")],
    });

    expect((await svc.list({ principal: principal(owner) })).items).toHaveLength(0);
    // the foreign character survives (skipped, not deleted)
    expect((await svc.list({ principal: principal(other) })).items).toHaveLength(1);
    expect((await svc.get({ principal: principal(other), characterId: foreign.id })).avatarAssetId).toBe(foreignAvatar);
    expect(h.reaps).toEqual([[avatarA, avatarB]]);
    expect(h.audits.filter((entry) => entry.entry.action === "character.remove")).toHaveLength(2);
  });
});
