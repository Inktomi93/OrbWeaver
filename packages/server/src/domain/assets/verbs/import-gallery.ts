// ONE portable gallery file → the owner's `gallery_items` curation rows, via the gallery serde core. Each
// image re-links by its content hash, then by its carried id; each `subjectCharacterHandle` resolves through
// `findCharacterByHandle`, and an unresolved/null handle writes the row un-charactered. Gates on asset
// ownership and dedups on `(assetId, subjectCharacterId)`. Never throws for a bad file — `{ok:false, error}`.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CanonicalGalleryItem } from "#primitives/serde/gallery";
import { GALLERY_SCHEMA_KIND, parseGallery } from "#primitives/serde/gallery";
import { portableParseError } from "#primitives/serde/lib";
import type { GalleryImportOutcome, GalleryPortableFile } from "../contract/results.ts";
import type { AssetsContext } from "../contract/service.ts";
import { assetIdForHash, importGalleryItem, ownedAssetForGallery } from "../persistence/queries.ts";

/** Restore ONE curation row: gate on asset ownership, re-link the handle, then idempotently write.
 *  Returns true only when a genuinely new row was written. */
async function restoreItem(ctx: AssetsContext, ownerId: UserId, item: CanonicalGalleryItem): Promise<boolean> {
  // The owner may hold these bytes under its own id (a fresh box's seeded avatars and plates).
  const byHash = item.assetHash === null ? undefined : await assetIdForHash(ctx.db, ownerId, item.assetHash);
  const assetId = byHash ?? item.assetId;
  // A missing/foreign asset means the blob was not part of this bundle — skip.
  if (byHash === undefined && (await ownedAssetForGallery(ctx.db, ownerId, assetId)) === undefined) {
    return false;
  }
  let subjectCharacterId: CharacterId | null = null;
  if (item.subjectCharacterHandle !== null && ctx.findCharacterByHandle !== undefined) {
    subjectCharacterId = await ctx.findCharacterByHandle({
      ownerId,
      handle: castId<CharacterHandle>(item.subjectCharacterHandle),
    });
  }
  const result = await importGalleryItem(ctx.db, {
    id: ctx.newGalleryItemId(),
    assetId,
    subjectCharacterId,
    createdAt: item.createdAt ?? ctx.now(),
  });
  return result.created;
}

export function createImportGallery(input: DbAssemblyInput<AssetsContext>): (ownerId: UserId, file: GalleryPortableFile) => Promise<GalleryImportOutcome> {
  const ctx: AssetsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId: UserId, file: GalleryPortableFile): Promise<GalleryImportOutcome> => {
    const parsed = parseGallery(file.bytes);
    if (!parsed.ok) {
      return { ok: false, error: `${portableParseError(GALLERY_SCHEMA_KIND, parsed.reason)} (${file.filename})` };
    }

    let created = false;
    for (const item of parsed.value.items) {
      const rowCreated = await restoreItem(ctx, ownerId, item);
      created = created || rowCreated;
    }
    return { ok: true, created };
  };
}
