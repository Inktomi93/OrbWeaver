// verb: exportGallery (export-import-portability.md §1) — the owner's `gallery_items` curation rows → the ONE
// gallery serde core (`#kit/serde/gallery` `buildGallery`). The RELATIONAL work (id → HANDLE resolution) lives
// HERE, before build; the serde stays pure `GalleryExport` ↔ bytes.
//
// THE RE-LINK: each row's `subjectCharacterId` resolves to the character's HANDLE (via the injected
// `resolveCharacterHandle` op — assets never sideways-imports the character domain) because character ids are
// not preserved across a fresh box. A null subject — OR a subject whose character was deleted mid-export (the
// op returns null) — carries a null handle (the item survives un-charactered on restore, matching the schema's
// SET NULL). `assetId` is carried AS-IS (Option A): the `assets` entity restores the blob under its original
// id, so the id is stable and re-links with no remap.
//
// Degradation (documented): when `resolveCharacterHandle` is absent (a non-portability context that never
// calls this verb), every item degrades to a null handle. The entry root wires the op, so the portability
// path always resolves handles.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { CanonicalGalleryItem } from "#kit/serde/gallery";
import { buildGallery } from "#kit/serde/gallery";
import type { GalleryPortableFile } from "../contract/results";
import type { AssetsContext } from "../contract/service";
import { listGalleryItemsForExport } from "../persistence/queries";

// The single-file name for an owner's whole curated gallery (the descriptor's `dir` + `.json` ext frame it).
const GALLERY_FILENAME = "gallery.json";

export function createExportGallery(
  ctx: AssetsContext,
): (ownerId: UserId) => Promise<GalleryPortableFile> {
  return async (ownerId: UserId): Promise<GalleryPortableFile> => {
    const rows = await listGalleryItemsForExport(ctx.db, ownerId);

    // Resolve id → handle ONCE per distinct subject character (bounded parallelism, no await-in-loop), then map
    // rows synchronously off the built map. A subject whose character is gone (op returns null) carries null.
    const resolve = ctx.resolveCharacterHandle;
    const distinctIds = [
      ...new Set(
        rows.flatMap((r) => (r.subjectCharacterId !== null ? [r.subjectCharacterId] : [])),
      ),
    ];
    const handleById = new Map<CharacterId, string | null>();
    if (resolve !== undefined) {
      const resolved = await Promise.all(distinctIds.map((id) => resolve(id)));
      for (const [i, id] of distinctIds.entries()) {
        handleById.set(id, resolved[i] ?? null);
      }
    }

    const items: CanonicalGalleryItem[] = rows.map((r) => ({
      assetId: r.assetId,
      subjectCharacterHandle:
        r.subjectCharacterId !== null ? (handleById.get(r.subjectCharacterId) ?? null) : null,
      createdAt: r.createdAt,
    }));
    return { filename: GALLERY_FILENAME, bytes: buildGallery({ items }) };
  };
}
