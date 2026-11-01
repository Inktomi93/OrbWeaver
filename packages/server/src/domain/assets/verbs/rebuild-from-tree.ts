// verb: rebuildFromTree — DISASTER RECOVERY: re-derive index rows for orphan blobs by walking +
// hashing the per-user CAS tree. For every blob with no `assets` row: read the bytes, `sniffMime` a
// best-effort mime, and write a fresh row through the coherence writer (`storeBlob` — the single
// `db.insert(assets)`/`cas.putBytes` site, so this respects `assets-single-writer`; the re-put dedup-hits the
// existing blob and only bumps mtime). The caller-supplied `kind` is stamped on every rebuilt row (a rebuild
// targets one kind at a time). Does NOT emit `asset.created`: a rebuilt row was never
// `asset.created`-emitted; the embeddings `content_hash` catch-up sweep re-covers the vectors.
// A folder whose owner is not a user is skipped and reported: its first row would fail the owner FK.
// UN-PRINCIPAL (D20) — an ops/DR surface.

import type { AssetKind } from "@orb/contracts/assets";
import { isConstraintViolation } from "@orb/db/query";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { AssetsContext, AssetsService } from "../contract/service.ts";
import { loadOwnerAssetRows } from "../persistence/maintenance.ts";
import { storeBlob } from "../persistence/queries.ts";

/** Re-index one owner's orphan blobs; returns the blobs walked and the rows newly created. */
async function rebuildOwner(
  ctx: AssetsContext,
  ownerId: UserId,
  kind: AssetKind,
  signal: AbortSignal | undefined,
): Promise<{ scanned: number; rebuilt: number }> {
  let scanned = 0;
  let rebuilt = 0;
  const rowHashes = new Set((await loadOwnerAssetRows(ctx.db, ownerId)).map((r) => r.hash));
  for await (const hash of ctx.cas.listHashes(ownerId)) {
    signal?.throwIfAborted();
    scanned += 1;
    if (rowHashes.has(hash)) {
      continue;
    }
    const bytes = await ctx.cas.read(ownerId, hash);
    const stored = await storeBlob(ctx.db, ctx.cas, {
      ownerId,
      bytes,
      kind,
      mime: sniffMime(bytes),
      candidateId: ctx.newAssetId(),
      now: ctx.now(),
      enforceMagic: false,
    });
    if (stored.created) {
      rebuilt += 1;
    }
  }
  return { scanned, rebuilt };
}

export function createRebuildFromTree(ctx: AssetsContext): AssetsService["rebuildFromTree"] {
  return async ({ kind, signal, onOwner }) => {
    let scanned = 0;
    let rebuilt = 0;
    let ownersWalked = 0;
    const skippedOwners: UserId[] = [];
    for await (const owner of ctx.cas.listOwners()) {
      const ownerId = castId<UserId>(owner);
      try {
        const walked = await rebuildOwner(ctx, ownerId, kind, signal);
        scanned += walked.scanned;
        rebuilt += walked.rebuilt;
      } catch (error) {
        // A folder whose owner is not a user fails the owner FK on its first row. Only that refusal is
        // skipped; the driver text stays out of the result.
        if (isConstraintViolation(error)?.kind !== "foreign-key") {
          throw error;
        }
        skippedOwners.push(ownerId);
        // The folder's files were looked at and left alone, so they are scanned, not unseen.
        for await (const _hash of ctx.cas.listHashes(ownerId)) {
          scanned += 1;
        }
      }
      ownersWalked += 1;
      onOwner?.({ ownersWalked, scanned, rebuilt });
    }
    return { scanned, rebuilt, skippedOwners };
  };
}
