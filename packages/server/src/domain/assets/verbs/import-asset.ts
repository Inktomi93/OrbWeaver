// The assets-portability IMPORT half: restores ONE blob into the owner's CAS + `assets` index row under its
// ORIGINAL id. Three fail-closed belts, never throws (`{ok:false}` instead): (1) poison defense — re-hash the
// bytes, reject unless they match the filename's claimed content-hash; (2) reject a cross-owner id claim
// (assets.id is a global PK); (3) reject an id bound to different bytes for the same owner. Same id+owner+
// bytes ⇒ idempotent no-op.

import type { PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { AssetsPortabilityContext } from "../contract/portability";
import { loadAssetCasRefById, storeBlob } from "../persistence/queries";
import { hashAssetBytes, parsePortableAssetFilename } from "../substrate/portable-asset-file";

export function createImportAsset(ctx: AssetsPortabilityContext): PortableEntity["importFile"] {
  return async (ownerId: UserId, file: PortableFile): Promise<PortableImportOutcome> => {
    const identity = parsePortableAssetFilename(file.filename);
    if (identity === undefined) {
      return { ok: false, error: `unrecognized assets filename: ${file.filename}` };
    }
    const { hash, id, kind, mime } = identity;

    // Belt 1 — poison defense: the bytes MUST hash to the address the name claims.
    if (hashAssetBytes(file.bytes) !== hash) {
      return { ok: false, error: "content hash does not match the claimed asset address" };
    }

    // Belts 2 + 3 — id-collision checks (un-owner-scoped: the id is a global PK).
    const existing = await loadAssetCasRefById(ctx.db, id);
    if (existing !== undefined) {
      if (existing.ownerId !== ownerId) {
        return { ok: false, error: "asset id already owned by another user" };
      }
      if (existing.hash !== hash) {
        return { ok: false, error: "asset id already bound to different content" };
      }
      return { ok: true, created: false }; // idempotent re-import
    }

    const stored = await storeBlob(ctx.db, ctx.cas, {
      ownerId,
      bytes: file.bytes,
      kind,
      mime,
      candidateId: id,
      now: ctx.now(),
      enforceMagic: false,
    });
    return { ok: true, created: stored.created };
  };
}
