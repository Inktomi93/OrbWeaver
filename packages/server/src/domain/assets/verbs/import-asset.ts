// The assets-portability IMPORT half: restores ONE blob into the owner's CAS + `assets` index row under its
// ORIGINAL id. Four fail-closed belts, never throws (`{ok:false}` instead): (1) poison defense — re-hash the
// bytes, reject unless they match the filename's claimed content-hash; (2) reject a cross-owner id claim
// (assets.id is a global PK); (3) reject an id bound to different bytes for the same owner; (4) reject a
// claimed id the destination CANNOT create — the owner already holds these exact bytes under a DIFFERENT id,
// and `assets_owner_hash_unique` allows only one row per `(ownerId, hash)`, so `storeBlob` would resolve to
// the pre-existing id and a `{ok:true}` here would promise a row that does not exist (every gallery / card /
// settings / inline `asset:<id>` ref restored afterwards would dangle). Same id+owner+bytes ⇒ idempotent,
// and that replay REPAIRS a row whose blob went missing rather than reporting success over an unreadable
// asset.
//
// WHY BELT 4 REFUSES RATHER THAN REMAPS: a remap has to reach every later entity's importFile, and the
// delivery core's seam is deliberately stateless per file (`importFile(ownerId, file)` — ONE serialization
// core, no cross-file channel). Inventing a second channel to carry an old→new id map is a portability-core
// design change, not an assets fix; until one exists the honest outcome is a named refusal an operator can
// act on. The refusal is complete: it is decided BEFORE any CAS write, so it leaves nothing behind.

import type { PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { AssetsPortabilityContext, PortableAssetIdentity } from "../contract/portability.ts";
import { assetIdForHash, loadAssetCasRefById, storeBlob } from "../persistence/queries.ts";
import { hashAssetBytes, parsePortableAssetFilename } from "../substrate/portable-asset-file.ts";

// File-local: one restore in flight — the DI slice plus the file and the identity its name decoded.
interface ImportTarget {
  readonly ctx: AssetsPortabilityContext;
  readonly ownerId: UserId;
  readonly file: PortableFile;
  readonly identity: PortableAssetIdentity;
}

export function createImportAsset(ctx: AssetsPortabilityContext): PortableEntity["importFile"] {
  return async (ownerId: UserId, file: PortableFile): Promise<PortableImportOutcome> => {
    const identity = parsePortableAssetFilename(file.filename);
    if (identity === undefined) {
      return { ok: false, error: `unrecognized assets filename: ${file.filename}` };
    }

    // Belt 1 — poison defense: the bytes MUST hash to the address the name claims.
    if (hashAssetBytes(file.bytes) !== identity.hash) {
      return { ok: false, error: "content hash does not match the claimed asset address" };
    }
    const target: ImportTarget = { ctx, ownerId, file, identity };

    // Belts 2 + 3 — id-collision checks (un-owner-scoped: the id is a global PK).
    const existing = await loadAssetCasRefById(ctx.db, identity.id);
    if (existing !== undefined) {
      return await importOverExistingRow(target, existing.ownerId, existing.hash);
    }

    // Belt 4 — the claimed id is uncreatable: these bytes are already indexed under another of this owner's
    // ids, and `(ownerId, hash)` is unique. Checked BEFORE the store, so the refusal writes nothing.
    const deduped = await assetIdForHash(ctx.db, ownerId, identity.hash);
    if (deduped !== undefined) {
      return remapRequired(identity.id, deduped);
    }

    const stored = await restoreBlob(target);
    // A concurrent store can land the same bytes between belt 4 and here; the upsert then resolves to THAT
    // id and the claimed one still does not exist — same verdict, decided on what the write actually did.
    return stored.assetId === identity.id ? { ok: true, created: stored.created } : remapRequired(identity.id, stored.assetId);
  };
}

/** Belts 2 + 3 plus the idempotent replay. The row is right; the BYTES may not be (an interrupted restore,
 *  or a GC that raced the link), so a matching replay re-runs the coherence writer — which re-puts the bytes
 *  and leaves the existing row untouched. Returning `{ok:true}` without that check is the failure mode: the
 *  authoritative bundle file is in hand and the asset stays unreadable. */
async function importOverExistingRow(target: ImportTarget, rowOwnerId: UserId, rowHash: string): Promise<PortableImportOutcome> {
  if (rowOwnerId !== target.ownerId) {
    return { ok: false, error: "asset id already owned by another user" };
  }
  if (rowHash !== target.identity.hash) {
    return { ok: false, error: "asset id already bound to different content" };
  }
  if (await target.ctx.cas.exists(target.ownerId, target.identity.hash)) {
    return { ok: true, created: false };
  }
  const repaired = await restoreBlob(target);
  return { ok: true, created: repaired.created };
}

/** The one call into the CAS+row coherence writer this verb makes (both the fresh restore and the repair). */
function restoreBlob(target: ImportTarget): ReturnType<typeof storeBlob> {
  return storeBlob(target.ctx.db, target.ctx.cas, {
    ownerId: target.ownerId,
    bytes: target.file.bytes,
    kind: target.identity.kind,
    mime: target.identity.mime,
    candidateId: target.identity.id,
    now: target.ctx.now(),
    enforceMagic: false,
  });
}

/** Belt 4's operator-facing verdict — names BOTH ids, since the fix is a remap of the referencing entities. */
function remapRequired(claimedId: AssetId, existingId: AssetId): PortableImportOutcome {
  return { ok: false, error: `asset ${claimedId} is already in this library under a different id (${existingId}) — restoring it needs an id remap` };
}
