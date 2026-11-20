// verb: importGalleryImage — one image a profile import carries into its characters' galleries. The bytes are stored
// under the owner (kind `gallery`, magic-verified, capped), so equal bytes are one asset; each character then gets one
// curation row, idempotent by `(asset, character)` (`importGalleryItem`). No row is written without a character: the
// gallery shows only character-scoped rows. `heldGalleryHashes` is the same key, read for the dry run.

import type { HeldGalleryHashes, ImportGalleryImage, StoreAsset } from "@orb/contracts/assets";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetsContext } from "../contract/service.ts";
import { heldGalleryHashes, importGalleryItem } from "../persistence/queries.ts";

/** `store` is the assets service's own store op, injected so the magic check and the cap are the store's. */
export function createImportGalleryImage(
  input: DbAssemblyInput<Pick<AssetsContext, "db" | "newGalleryItemId" | "now">> & { readonly store: StoreAsset },
): ImportGalleryImage {
  const db = databaseForOwner(input.db);
  return async ({ principal, bytes, mime, characterIds }) => {
    const stored = await input.store({ principal, bytes, kind: "gallery", mime, enforceMagic: true, maxBytes: ASSET_UPLOAD_MAX_BYTES });
    let created = 0;
    for (const subjectCharacterId of characterIds) {
      const row = await importGalleryItem(db, { id: input.newGalleryItemId(), assetId: stored.assetId, subjectCharacterId, createdAt: input.now() });
      created += row.created ? 1 : 0;
    }
    return { created };
  };
}

export function createHeldGalleryHashes(input: DbAssemblyInput<Pick<AssetsContext, "db">>): HeldGalleryHashes {
  const db = databaseForOwner(input.db);
  return (args) => heldGalleryHashes(db, args);
}
