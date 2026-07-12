// verb: importGallery (export-import-portability.md §1) — ONE portable gallery file → the owner's
// `gallery_items` curation rows, via the ONE gallery serde core (`#kit/serde/gallery` `parseGallery`). The
// RELATIONAL work (HANDLE → owner's character id) lives HERE; the serde stays pure bytes ↔ `GalleryExport`.
//
// THE RE-LINK: each carried `subjectCharacterHandle` resolves to the importer's OWN character id via the
// injected `findCharacterByHandle` op (the PD-108 handle oracle — the SAME owner-scoped read the card importer
// injects, NOT a parallel lookup). A handle that does not resolve (that character does not exist on this box),
// OR a null handle, writes the row UN-CHARACTERED (`subjectCharacterId = null`, matching the schema's SET
// NULL). `assetId` is carried AS-IS (Option A): the `assets` entity restored the blob under its original id
// BEFORE gallery imports (`PORTABLE_IMPORT_ORDER`), so the row's FK re-links with no remap. The verb GATES on
// asset ownership (`ownedAssetForGallery`) before writing — an item whose asset was not restored / is not the
// importer's is SKIPPED (the FK never violates; a curation row cannot reference another user's asset, §1.3).
//
// IDEMPOTENT: dedup on `(assetId, subjectCharacterId)` (the `gallery_items_asset_subject_unique` axis,
// explicit existence check so the NULL-subject case dedups too) — a re-import writes zero dupes. NEVER throws
// for a bad file (returns `{ok:false, error}`), so one malformed entry cannot abort a bundle.
//
// Degradation (documented): when `findCharacterByHandle` is absent (a non-portability context that never calls
// this verb), every item imports un-charactered. The entry root wires the op, so the portability path always
// re-links.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { CanonicalGalleryItem } from "#kit/serde/gallery";
import { parseGallery } from "#kit/serde/gallery";
import type { GalleryImportOutcome, GalleryPortableFile } from "../contract/results";
import type { AssetsContext } from "../contract/service";
import { importGalleryItem, ownedAssetForGallery } from "../persistence/queries";

/** Restore ONE curation row: gate on asset ownership, re-link the handle, then idempotently write. Kept as one
 *  awaited unit so the loop makes a single sequential call per item (the check → insert must not race). Returns
 *  true ONLY when a genuinely new row was written (a skipped/deduped item returns false). */
async function restoreItem(
  ctx: AssetsContext,
  ownerId: UserId,
  item: CanonicalGalleryItem,
): Promise<boolean> {
  // The asset must have been restored AND be the importer's (Option A: same id, owner-scoped). A missing /
  // foreign asset means the blob was not part of this bundle — skip (the curation row cannot exist, §1.3).
  const owned = await ownedAssetForGallery(ctx.db, ownerId, item.assetId);
  if (owned === undefined) {
    return false;
  }
  // Re-link the handle to the owner's character id, or null (un-charactered) when it does not resolve.
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

export function createImportGallery(
  ctx: AssetsContext,
): (ownerId: UserId, file: GalleryPortableFile) => Promise<GalleryImportOutcome> {
  return async (ownerId: UserId, file: GalleryPortableFile): Promise<GalleryImportOutcome> => {
    const parsed = parseGallery(file.bytes);
    if (parsed === null) {
      return { ok: false, error: `not a gallery file (${file.filename})` };
    }

    let created = false;
    for (const item of parsed.items) {
      // biome-ignore lint/performance/noAwaitInLoops: curation rows restore serially — each item's dedup existence-check + insert must not race a sibling row of the same (assetId, subjectCharacterId).
      const rowCreated = await restoreItem(ctx, ownerId, item);
      created = created || rowCreated;
    }
    return { ok: true, created };
  };
}
