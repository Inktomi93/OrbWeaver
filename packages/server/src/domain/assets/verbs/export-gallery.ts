// verb: exportGallery — resolves subjectCharacterId → HANDLE (via injected resolveCharacterHandle; assets
// never sideways-imports character domain) since character ids don't survive a fresh box; missing/deleted
// subject degrades to null handle. assetId carried as-is (stable, no remap).

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { CanonicalGalleryItem } from "#kit/serde/gallery";
import { buildGallery } from "#kit/serde/gallery";
import type { AssetsContext } from "../context";
import type { GalleryPortableFile } from "../contract/results";
import { listGalleryItemsForExport } from "../persistence/queries";

const GALLERY_FILENAME = "gallery.json";

export function createExportGallery(ctx: AssetsContext): (ownerId: UserId) => Promise<GalleryPortableFile> {
  return async (ownerId: UserId): Promise<GalleryPortableFile> => {
    const rows = await listGalleryItemsForExport(ctx.db, ownerId);

    // Resolve id → handle once per distinct subject character (bounded parallelism, no await-in-loop).
    const resolve = ctx.resolveCharacterHandle;
    const distinctIds = [...new Set(rows.flatMap((r) => (r.subjectCharacterId !== null ? [r.subjectCharacterId] : [])))];
    const handleById = new Map<CharacterId, string | null>();
    if (resolve !== undefined) {
      const resolved = await Promise.all(distinctIds.map((id) => resolve(id)));
      for (const [i, id] of distinctIds.entries()) {
        handleById.set(id, resolved[i] ?? null);
      }
    }

    const items: CanonicalGalleryItem[] = rows.map((r) => ({
      assetId: r.assetId,
      subjectCharacterHandle: r.subjectCharacterId !== null ? (handleById.get(r.subjectCharacterId) ?? null) : null,
      createdAt: r.createdAt,
    }));
    return { filename: GALLERY_FILENAME, bytes: buildGallery({ items }) };
  };
}
