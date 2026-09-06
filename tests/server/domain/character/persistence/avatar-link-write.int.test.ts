// persistence: avatar-link-write — the character-OWNED avatar-pointer write `assets.backfillAvatars`
// delegates to (it moved here from assets in the 2026-08-02 cross-domain-write routing). Real libSQL.
// Load-bearing assertions:
//   • the relink sets `avatarAssetId` on the owner's OWN character row;
//   • the owner predicate is in the WHERE — a FOREIGN character in the same batch is NOT relinked (the
//     property that makes an un-principal maintenance op safe to hand a caller-supplied id list);
//   • an empty list is a no-op;
//   • the relink STAMPS `updatedAt` (#1379 item 2) — the X-16 edited-stamp precedent the archive flip
//     records. "Silent by design" covers audit/bus/snapshot and never covered the timestamp; a stale one
//     meant a recency-sorted library showed nothing had happened and a cache keyed on it kept the old art.
//
// NOTE on the previous header claim: it said an empty `db.batch` is something "libSQL rejects". MEASURED
// FALSE (#1377 item 3 probe) — `db.batch([])` resolves with `[]`. The early return is still correct, just
// not for that reason: there is nothing to write.

import { characters } from "@orb/db";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createLinkCharacterAvatars } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedRawCharacter, seedUser } from "../_support.ts";

/** A pinned relink instant, deliberately DIFFERENT from the seed's `updatedAt` so the stamp is provable. */
const RELINK_AT = 1_800_000_000_000;

describe("persistence/avatar-link-write", () => {
  test("links the owner's character and skips a foreign one (owner-scoped WHERE)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const asset = await seedAsset(db, { ownerId: owner });
    const mine = await seedRawCharacter(db, { id: "character_mine", ownerId: owner, handle: castId<CharacterHandle>("mine") });
    const theirs = await seedRawCharacter(db, { id: "character_theirs", ownerId: other, handle: castId<CharacterHandle>("theirs") });

    const before = (await db.select({ at: characters.updatedAt }).from(characters).where(eq(characters.id, mine)))[0]?.at;

    await createLinkCharacterAvatars({ db, now: () => RELINK_AT })({
      ownerId: owner,
      links: [
        { characterId: mine, assetId: asset },
        { characterId: theirs, assetId: asset },
      ],
    });

    const mineRow = (await db.select({ avatar: characters.avatarAssetId, at: characters.updatedAt }).from(characters).where(eq(characters.id, mine)))[0];
    const theirsRow = (await db.select({ avatar: characters.avatarAssetId, at: characters.updatedAt }).from(characters).where(eq(characters.id, theirs)))[0];
    expect(mineRow?.avatar).toBe(asset);
    expect(theirsRow?.avatar).toBeNull();
    // The stamp lands on the row that CHANGED, from the injected clock, and nowhere else — the foreign
    // row's timestamp is untouched by a batch that named it.
    expect(mineRow?.at).toBe(RELINK_AT);
    expect(mineRow?.at).not.toBe(before);
    expect(theirsRow?.at).not.toBe(RELINK_AT);
  });

  // #1480 item 4 — THE ASSET AXIS. The WHERE constrained the character (id + owner); the SET wrote
  // `link.assetId` unexamined, so a caller-supplied id pointing at ANOTHER owner's asset landed on the
  // owner's own card. That is a live pointer into a library the card's owner cannot read AND it GC-roots
  // the other owner's blob through an FK they do not control — the same failure `ensureAssetOwned` /
  // `ensureBackgroundOverrideOwned` exist to stop on the front-door verbs. The sole production caller
  // (`assets.backfillAvatars`) stores the blob under the identical `ownerId` moments before linking, so
  // this is the local belt, not a live bug.
  test("a FOREIGN asset is refused — the asset must share the character's owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreignAsset = await seedAsset(db, { id: "asset_foreign", ownerId: other });
    const ownAsset = await seedAsset(db, { id: "asset_own", ownerId: owner, hash: "own-asset-hash" });
    const mine = await seedRawCharacter(db, { id: "character_mine", ownerId: owner, handle: castId<CharacterHandle>("mine") });

    // Receipt taken AS `owner` (the op's `ownerId` argument IS the principal this write runs under).
    await createLinkCharacterAvatars({ db, now: () => RELINK_AT })({ ownerId: owner, links: [{ characterId: mine, assetId: foreignAsset }] });

    const refused = (await db.select({ avatar: characters.avatarAssetId, at: characters.updatedAt }).from(characters).where(eq(characters.id, mine)))[0];
    expect(refused?.avatar).toBeNull();
    // Zero rows updated — the refusal does not even stamp `updatedAt` (a stamp with no relink would be a lie).
    expect(refused?.at).not.toBe(RELINK_AT);

    // POSITIVE ARM — the same op, the same principal, the owner's OWN asset: it lands. (Without this the
    // empty read above would be evidence about the query, not about the predicate.)
    await createLinkCharacterAvatars({ db, now: () => RELINK_AT })({ ownerId: owner, links: [{ characterId: mine, assetId: ownAsset }] });
    const linked = (await db.select({ avatar: characters.avatarAssetId, at: characters.updatedAt }).from(characters).where(eq(characters.id, mine)))[0];
    expect(linked?.avatar).toBe(ownAsset);
    expect(linked?.at).toBe(RELINK_AT);
  });

  test("an empty link list writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const mine = await seedRawCharacter(db, { id: "character_mine", ownerId: owner, handle: castId<CharacterHandle>("mine") });

    await createLinkCharacterAvatars({ db, now: () => RELINK_AT })({ ownerId: owner, links: [] });

    const rows = await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, mine));
    expect(rows[0]?.avatar).toBeNull();
  });
});
