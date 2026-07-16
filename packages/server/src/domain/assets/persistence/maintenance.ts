// domain/assets/persistence/maintenance — the DB reads/writes the maintenance verbs need beyond the core
// `queries.ts` surface: per-owner index-row enumeration (GC/fsck/rebuild walk one owner's CAS against these),
// the distinct owner list (fsck's dangling-row pass drives off the DB, not the tree — an owner whose blobs
// all vanished has no CAS dir but still has rows), the single-row delete the drop-row-BEFORE-blob ordering
// runs first, and the batched avatar relink `backfillAvatars` writes. NO `cas.putBytes` / `db.insert(assets)`
// here (those stay the single coherence writer in `queries.ts` — `assets-single-writer`); this file only
// ENUMERATES / DELETES index rows and UPDATEs the character avatar pointer.

import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

// File-local read shape (not exported — types-in-contract): one index row's `(id, hash)`, the pair a per-owner
// CAS sweep needs to answer "does this blob have a row, and which asset is it?".
interface AssetRowRef {
  readonly id: AssetId;
  readonly hash: string;
}

/** Every `(id, hash)` index row for ONE owner (the sweep partition — GC/fsck/rebuild each walk this owner's
 *  blobs against it). Owner-scoped in the WHERE. */
export async function loadOwnerAssetRows(db: Db, ownerId: UserId): Promise<AssetRowRef[]> {
  return await db.select({ id: assets.id, hash: assets.hash }).from(assets).where(eq(assets.ownerId, ownerId));
}

/** The distinct owners that have at least one index row. `fsck`'s dangling/corrupt pass iterates THESE (an
 *  owner whose blob dir is entirely gone has no CAS-tree presence but still owns rows that must be checked). */
export async function listAssetOwners(db: Db): Promise<UserId[]> {
  const rows = await db.selectDistinct({ ownerId: assets.ownerId }).from(assets);
  return rows.map((r) => r.ownerId);
}

/** Delete ONE index row by id. The FIRST step of the drop-row-BEFORE-blob deletion ordering: a crash after
 *  this (before `cas.remove`) leaves a benign orphan blob (reclaimed next sweep), NEVER a row pointing at a
 *  missing blob. The caller has already proven the asset is unreferenced. */
export async function deleteAssetRow(db: Db, assetId: AssetId): Promise<void> {
  await db.delete(assets).where(eq(assets.id, assetId));
}

/** Batch-write `avatarAssetId` back onto owned character rows (the `backfillAvatars` relink) — ONE
 *  `db.batch`, owner-scoped per row, via the `@orb/db/kit` batch helpers (no inline `BatchItem` casts). A
 *  no-op on an empty list (caller guarantees non-empty when it calls). */
export async function batchLinkAvatars(
  db: Db,
  ownerId: UserId,
  links: readonly { readonly characterId: CharacterId; readonly assetId: AssetId }[],
): Promise<void> {
  const stmts = links.map((link) =>
    batchStmt(
      db
        .update(characters)
        .set({ avatarAssetId: link.assetId })
        .where(and(eq(characters.id, link.characterId), eq(characters.ownerId, ownerId))),
    ),
  );
  await db.batch(batchMany(stmts));
}
