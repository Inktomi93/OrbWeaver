// ONE portable gallery file → the owner's `gallery_items` curation rows, via the gallery serde core. Each
// carried `subjectCharacterHandle` resolves to the importer's own character id via `findCharacterByHandle`;
// an unresolved/null handle writes the row un-charactered. Gates on asset ownership before writing (a
// curation row cannot reference another user's asset) and dedups on `(assetId, subjectCharacterId)`.
// Never throws for a bad file — returns `{ok:false, error}` so one malformed entry cannot abort a bundle.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { CanonicalGalleryItem } from "#kit/serde/gallery";
import { GALLERY_SCHEMA_KIND, parseGallery } from "#kit/serde/gallery";
import { portableParseError } from "#kit/serde/lib";
import type { AssetsContext } from "../context";
import type { GalleryImportOutcome, GalleryPortableFile } from "../contract/results";
import { importGalleryItem, ownedAssetForGallery } from "../persistence/queries";

/** Restore ONE curation row: gate on asset ownership, re-link the handle, then idempotently write.
 *  Returns true only when a genuinely new row was written. */
async function restoreItem(ctx: AssetsContext, ownerId: UserId, item: CanonicalGalleryItem): Promise<boolean> {
  // A missing/foreign asset means the blob was not part of this bundle — skip.
  const owned = await ownedAssetForGallery(ctx.db, ownerId, item.assetId);
  if (owned === undefined) {
    return false;
  }
  let subjectCharacterId: CharacterId | null = null;
  if (item.subjectCharacterHandle !== null && ctx.findCharacterByHandle !== undefined) {
    subjectCharacterId = await ctx.findCharacterByHandle({
      ownerId,
      handle: item.subjectCharacterHandle,
    });
  }
  const result = await importGalleryItem(ctx.db, {
    id: ctx.newGalleryItemId(),
    assetId: item.assetId,
    subjectCharacterId,
    createdAt: item.createdAt ?? ctx.now(),
  });
  return result.created;
}

export function createImportGallery(ctx: AssetsContext): (ownerId: UserId, file: GalleryPortableFile) => Promise<GalleryImportOutcome> {
  return async (ownerId: UserId, file: GalleryPortableFile): Promise<GalleryImportOutcome> => {
    const parsed = parseGallery(file.bytes);
    if (!parsed.ok) {
      return { ok: false, error: `${portableParseError(GALLERY_SCHEMA_KIND, parsed.reason)} (${file.filename})` };
    }

    let created = false;
    for (const item of parsed.value.items) {
      // biome-ignore lint/performance/noAwaitInLoops: curation rows restore serially — each item's dedup existence-check + insert must not race a sibling row of the same (assetId, subjectCharacterId).
      const rowCreated = await restoreItem(ctx, ownerId, item);
      created = created || rowCreated;
    }
    return { ok: true, created };
  };
}
