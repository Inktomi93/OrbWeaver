// persistence: avatar-link-write — the character-OWNED avatar-pointer write `assets.backfillAvatars`
// delegates to (it moved here from assets in the 2026-08-02 cross-domain-write routing). Real libSQL.
// Load-bearing assertions:
//   • the relink sets `avatarAssetId` on the owner's OWN character row;
//   • the owner predicate is in the WHERE — a FOREIGN character in the same batch is NOT relinked (the
//     property that makes an un-principal maintenance op safe to hand a caller-supplied id list);
//   • an empty list is a no-op (never an empty `db.batch`, which libSQL rejects).

import { characters } from "@orb/db";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createLinkCharacterAvatars } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedRawCharacter, seedUser } from "../_support.ts";

describe("persistence/avatar-link-write", () => {
  test("links the owner's character and skips a foreign one (owner-scoped WHERE)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const asset = await seedAsset(db, { ownerId: owner });
    const mine = await seedRawCharacter(db, { id: "character_mine", ownerId: owner, handle: castId<CharacterHandle>("mine") });
    const theirs = await seedRawCharacter(db, { id: "character_theirs", ownerId: other, handle: castId<CharacterHandle>("theirs") });

    await createLinkCharacterAvatars({ db })({
      ownerId: owner,
      links: [
        { characterId: mine, assetId: asset },
        { characterId: theirs, assetId: asset },
      ],
    });

    const mineRow = await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, mine));
    const theirsRow = await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, theirs));
    expect(mineRow[0]?.avatar).toBe(asset);
    expect(theirsRow[0]?.avatar).toBeNull();
  });

  test("an empty link list writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const mine = await seedRawCharacter(db, { id: "character_mine", ownerId: owner, handle: castId<CharacterHandle>("mine") });

    await createLinkCharacterAvatars({ db })({ ownerId: owner, links: [] });

    const rows = await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, mine));
    expect(rows[0]?.avatar).toBeNull();
  });
});
