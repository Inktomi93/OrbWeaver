// The assets-portability IMPORT half: restores ONE blob under its ORIGINAL id, or answers success with a note
// when the owner already holds these bytes under another id, because every portable referrer re-links by
// content hash and the import keeps no cross-file channel (D136). Never throws; a refusal is `{ok:false}`.

import type { PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
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

export function createImportAsset(input: DbAssemblyInput<AssetsPortabilityContext>): PortableEntity["importFile"] {
  const ctx: AssetsPortabilityContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId: UserId, file: PortableFile): Promise<PortableImportOutcome> => {
    const identity = parsePortableAssetFilename(file.filename);
    if (identity === undefined) {
      return { ok: false, error: `unrecognized assets filename: ${file.filename}` };
    }

    // Check 1 — poison defense: the bytes MUST hash to the address the name claims.
    if (hashAssetBytes(file.bytes) !== identity.hash) {
      return { ok: false, error: "content hash does not match the claimed asset address" };
    }
    const target: ImportTarget = { ctx, ownerId, file, identity };

    // Checks 2 + 3 — id-collision checks (un-owner-scoped: the id is a global PK).
    const existing = await loadAssetCasRefById(ctx.db, identity.id);
    if (existing !== undefined) {
      return await importOverExistingRow(target, existing.ownerId, existing.hash);
    }

    // `assets_owner_hash_unique` allows one row per `(ownerId, hash)`, so the owner's existing row for these
    // bytes (a fresh box's first-login plates and avatars) is the one every referrer resolves to. Its blob may
    // be gone while the row stays, and the bundle file in hand repairs it, as the same-id replay does.
    const held = await assetIdForHash(ctx.db, ownerId, identity.hash);
    if (held !== undefined) {
      if (!(await ctx.cas.exists(ownerId, identity.hash))) {
        await restoreBlob(target);
      }
      return alreadyHeld(identity.id, held);
    }

    const stored = await restoreBlob(target);
    // A concurrent store can land the same bytes between the check and here; the upsert then resolves to
    // THAT id — the same outcome, decided on what the write actually did.
    return stored.assetId === identity.id ? { ok: true, created: stored.created } : alreadyHeld(identity.id, stored.assetId);
  };
}

/** Checks 2 + 3 plus the idempotent replay. The row is right; the BYTES may not be (an interrupted restore,
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

/** The bytes are already in this library under another id; the restore keeps that row and names both ids. */
function alreadyHeld(claimedId: AssetId, heldId: AssetId): PortableImportOutcome {
  return { ok: true, created: false, notes: [`asset ${claimedId} is already in this library as ${heldId}; references to it re-link by content`] };
}
