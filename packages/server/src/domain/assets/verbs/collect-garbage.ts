// verb: collectGarbage — mark-sweep GC over the WHOLE per-user CAS against the live reference set (PD-26).
// For every blob on disk: it is LIVE iff an `assets` row carries its hash AND that asset id is referenced by
// at least one asset-ref registry column (`persistence/asset-refs.ts`). A non-live blob older than the GRACE
// window (mtime — guards the put→link gap: an in-flight import may have stored bytes it hasn't linked yet;
// the CAS `putBytes` bumps mtime precisely so a deduped re-import is protected too) is reclaimed
// drop-row-BEFORE-blob. This UNIFIES both leak shapes in one pass — a blob with no row (a crash/DR orphan)
// AND a blob whose row is referenced by nothing (an abandoned upload) are both "not in the live set".
// Distinct from `reapIfOrphan`: this sweeps everything WITH grace; that checks a known set with NONE.
// Script/workload-driven; UN-PRINCIPAL (D20). `dryRun` counts what it WOULD reclaim without deleting.

import type { Db } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Cas, VariantCache } from "#infra/storage";
import type { AssetsContext } from "../context";
import type { AssetsService } from "../contract/service";
import { selectAllReferencedAssetIds } from "../persistence/asset-refs";
import { loadOwnerAssetRows } from "../persistence/maintenance";
import { purgeAsset } from "../substrate/purge-asset";

/** The grace-window floor (epoch-ms): a blob touched within this of `now` is skipped even if unreferenced —
 *  it may be a just-stored, not-yet-linked import. One hour generously covers a single import request's
 *  put→link gap; an operator can widen it via `graceMs`. */
const DEFAULT_GRACE_MS = 3_600_000;

interface SweepInput {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants: VariantCache | undefined;
  readonly ownerId: UserId;
  readonly referenced: ReadonlySet<AssetId>;
  readonly now: number;
  readonly graceMs: number;
  readonly dryRun: boolean;
  readonly signal: AbortSignal | undefined;
}

/** Sweep ONE owner's blobs against the live set; return the counts. Extracted so the verb body stays under
 *  the cognitive-complexity gate — the nested per-blob decision lives here. */
async function sweepOwner(input: SweepInput): Promise<{ scanned: number; reclaimed: number }> {
  const rows = await loadOwnerAssetRows(input.db, input.ownerId);
  const idByHash = new Map(rows.map((r) => [r.hash, r.id]));
  let scanned = 0;
  let reclaimed = 0;

  for await (const hash of input.cas.listHashes(input.ownerId)) {
    input.signal?.throwIfAborted();
    scanned++;
    const assetId = idByHash.get(hash);
    if (assetId !== undefined && input.referenced.has(assetId)) {
      continue; // live — a registry column points at it.
    }
    const mtime = await input.cas.mtimeMs(input.ownerId, hash);
    if (mtime !== undefined && input.now - mtime < input.graceMs) {
      continue; // within grace — a possibly-just-stored, not-yet-linked blob.
    }
    reclaimed++;
    if (input.dryRun) {
      continue;
    }
    await purgeAsset({
      db: input.db,
      cas: input.cas,
      variants: input.variants,
      assetId,
      ownerId: input.ownerId,
      hash,
    });
  }
  return { scanned, reclaimed };
}

export function createCollectGarbage(ctx: AssetsContext): AssetsService["collectGarbage"] {
  return async ({ dryRun = false, graceMs = DEFAULT_GRACE_MS, signal }) => {
    const referenced = await selectAllReferencedAssetIds(ctx.db);
    const now = ctx.now();
    let scanned = 0;
    let reclaimed = 0;

    for await (const owner of ctx.cas.listOwners()) {
      const counts = await sweepOwner({
        db: ctx.db,
        cas: ctx.cas,
        variants: ctx.variants,
        // The CAS owner segment IS the `UserId` (D21 — the partition key is the branded id verbatim).
        ownerId: castId<UserId>(owner),
        referenced,
        now,
        graceMs,
        dryRun,
        signal,
      });
      scanned += counts.scanned;
      reclaimed += counts.reclaimed;
    }
    return { scanned, reclaimed, dryRun };
  };
}
