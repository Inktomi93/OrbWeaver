// domain/assets/substrate/purge-asset — the ONE drop-row-BEFORE-blob deletion primitive, shared by BOTH GC
// paths (`collectGarbage` + `reapIfOrphan`) so the critical ordering has exactly one home (substrate = the
// sanctioned intra-domain shared slot). THE INVARIANT (data-integrity load-bearing):
//   1. delete the `assets` row FIRST only if the relation-bound liveness predicate still wins,
//   2. then `cas.remove` the blob,
//   3. then `variants?.removeAll` (the handle is optional — a DR/rebuild env omits it).
// A crash between any two steps leaves a BENIGN orphan (a blob — or a variant — with no row, reclaimed by the
// next sweep), NEVER a row pointing at a missing blob. Self-heal beats repair. Per-asset (never batch-all-rows
// then batch-all-blobs — that would widen the row-without-blob window). `assetId === undefined` = a pure
// orphan blob (no index row to drop) — steps 2+3 only. Returns whether the purge won; a newly-live row
// returns false without touching either byte store.

import type { Db } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { Cas, VariantCache } from "#infra/storage";
import { deleteAssetRowIfUnreferenced } from "../persistence/asset-refs.ts";

export async function purgeAsset(args: {
  readonly db: Db;
  readonly cas: Cas;
  readonly variants: VariantCache | undefined;
  /** The index row to drop first, or `undefined` for a pure orphan blob (no row). */
  readonly assetId: AssetId | undefined;
  readonly ownerId: UserId;
  readonly hash: string;
}): Promise<boolean> {
  if (args.assetId !== undefined && !(await deleteAssetRowIfUnreferenced(args.db, args.assetId))) {
    return false;
  }
  await args.cas.remove(args.ownerId, args.hash);
  await args.variants?.removeAll(args.ownerId, args.hash);
  return true;
}
