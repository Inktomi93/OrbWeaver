// domain/assets/substrate/purge-asset — the ONE drop-row-BEFORE-blob deletion primitive, shared by BOTH GC
// paths (`collectGarbage` + `reapIfOrphan`) so the critical ordering has exactly one home (substrate = the
// sanctioned intra-domain shared slot). THE INVARIANT (data-integrity load-bearing):
//   1. delete the `assets` row FIRST only if the relation-bound liveness predicate still wins,
//   2. then `cas.remove` the blob,
//   3. then `variants?.removeAll` (the handle is optional — a DR/rebuild env omits it).
// A crash between any two steps leaves a BENIGN orphan (a blob — or a variant — with no row, reclaimed by the
// next sweep), NEVER a row pointing at a missing blob. Self-heal beats repair. Per-asset (never batch-all-rows
// then batch-all-blobs — that would widen the row-without-blob window). `assetId === undefined` = the caller
// saw NO index row for these bytes — steps 2+3 only, but the owner+hash is RE-RESOLVED here first (the
// caller's verdict is a snapshot; a concurrent store may have indexed the blob since). Returns whether the
// purge won; a newly-live row returns false without touching either byte store.

import type { Db } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { Cas, VariantCache } from "#infra/storage";
import { deleteAssetRowIfUnreferenced } from "../persistence/asset-refs.ts";
import { assetIdForHash } from "../persistence/queries.ts";

export async function purgeAsset(args: {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants: VariantCache | undefined;
  /** The index row to drop first, or `undefined` when the caller saw no row for these bytes (re-resolved). */
  readonly assetId: AssetId | undefined;
  readonly ownerId: UserId;
  readonly hash: string;
}): Promise<boolean> {
  if (args.assetId !== undefined) {
    if (!(await deleteAssetRowIfUnreferenced(args.db, args.ownerId, args.assetId))) {
      return false;
    }
  } else if ((await assetIdForHash(args.db, args.ownerId, args.hash)) !== undefined) {
    // The ORPHAN arm's destructive edge. The caller's "no row" verdict came from a snapshot it took before
    // walking the CAS, and a store that deduped onto these bytes since then has INDEXED them — dropping the
    // bytes now would leave that row pointing at nothing, the one state this primitive exists to prevent.
    // Re-resolving `(owner, hash)` here is the narrowest honest belt: SQLite's atomic unit is one statement
    // (a batch cannot span the filesystem unlink at all), so there is no transaction that could hold the
    // blob removal and the row check together. The residual window is this query → `cas.remove`, and the
    // blob is protected across it by the GC grace window (`putBytes` bumps mtime on every dedup hit) — the
    // sweep re-judges the blob with a fresh snapshot on its next pass.
    return false;
  }
  await args.cas.remove(args.ownerId, args.hash);
  await args.variants?.removeAll(args.ownerId, args.hash);
  return true;
}
