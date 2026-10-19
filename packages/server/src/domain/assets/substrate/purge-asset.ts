// domain/assets/substrate/purge-asset — the ONE drop-row-BEFORE-blob deletion primitive, shared by BOTH GC
// paths (`collectGarbage` + `reapIfOrphan`) so the critical ordering has exactly one home (substrate = the
// sanctioned intra-domain shared slot). THE INVARIANT (data-integrity load-bearing):
//   1. delete the `assets` row FIRST only if the relation-bound liveness predicate still wins,
//   2. re-resolve `(owner, hash)` and stop if any row indexes these bytes now,
//   3. then `cas.remove` the blob,
//   4. then `variants?.removeAll` (the handle is optional — a DR/rebuild env omits it).
// A crash between any two steps leaves a BENIGN orphan (a blob — or a variant — with no row, reclaimed by the
// next sweep), NEVER a row pointing at a missing blob. Self-heal beats repair. Per-asset (never batch-all-rows
// then batch-all-blobs — that would widen the row-without-blob window). `assetId === undefined` = the caller
// saw NO index row for these bytes — steps 2-4 only. Returns whether the bytes were reclaimed; a row that
// still wins, or a row that indexed the bytes since, returns false without touching either byte store.

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
  if (args.assetId !== undefined && !(await deleteAssetRowIfUnreferenced(args.db, args.ownerId, args.assetId))) {
    return false;
  }
  // The destructive edge for both arms. The caller's verdict is a snapshot, and the row drop above does not
  // stop a same-owner upload of these same bytes: its put dedups onto the still-present file and its insert
  // lands a FRESH row once the old one is gone. Unlinking now would leave that row pointing at nothing, the one
  // state this primitive exists to prevent. SQLite's atomic unit is one statement and no batch spans the
  // filesystem unlink, so this query → `cas.remove` is the residual window; the GC grace window covers it
  // (`putBytes` bumps mtime on every dedup hit) and the next sweep re-judges the blob.
  if ((await assetIdForHash(args.db, args.ownerId, args.hash)) !== undefined) {
    return false;
  }
  await args.cas.remove(args.ownerId, args.hash);
  await args.variants?.removeAll(args.ownerId, args.hash);
  return true;
}
