// domain/assets/persistence/maintenance — the DB reads/writes the maintenance verbs need beyond the core
// `queries.ts` surface: per-owner index-row enumeration (GC/fsck/rebuild walk one owner's CAS against these),
// the distinct owner list (fsck's dangling-row pass drives off the DB, not the tree — an owner whose blobs
// all vanished has no CAS dir but still has rows), and the GATHER half of the avatar backfill. NO
// `cas.putBytes` / `db.insert(assets)` here
// (those stay the single coherence writer in `queries.ts` — `assets-single-writer`), and NO write into
// another domain's table: this file ENUMERATES assets' OWN index rows and READS `characters` for
// the backfill candidates — the relink WRITE is character's (`linkCharacterAvatars`, injected).

import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

// File-local read shape (not exported — types-in-contract): one index row's `(id, hash)`, the pair a per-owner
// CAS sweep needs to answer "does this blob have a row, and which asset is it?".
interface AssetRowRef {
  readonly id: AssetId;
  readonly hash: string;
}

// File-local: one staged character the avatar backfill may re-pair. `importHash` is NOT NULL by the query's
// own predicate, but the column is nullable — the caller re-narrows it before the CAS probe.
interface AvatarBackfillCandidate {
  readonly id: CharacterId;
  readonly ownerId: UserId;
  readonly importHash: string | null;
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

/** The GATHER half of the avatar backfill: staged character rows the relink could re-pair — a recorded
 *  card (`importHash`) but no linked avatar. `ownerId === null` is the admin-wide sweep; otherwise
 *  owner-scoped in the WHERE. Lives HERE, beside the `batchLinkAvatars` write it feeds: `characters` is
 *  CHARACTER's table, so an assets-side read of it belongs in assets' db-access slot, never in the
 *  workload-contribution seam that consumes it (Tier-1-DB.md §"Cross-tier composition"; `own-tables-only`). */
export async function loadAvatarBackfillCandidates(db: Db, ownerId: UserId | null): Promise<AvatarBackfillCandidate[]> {
  const scope =
    ownerId === null
      ? and(isNull(characters.avatarAssetId), isNotNull(characters.importHash))
      : and(eq(characters.ownerId, ownerId), isNull(characters.avatarAssetId), isNotNull(characters.importHash));
  return await db.select({ id: characters.id, ownerId: characters.ownerId, importHash: characters.importHash }).from(characters).where(scope);
}

// The avatar-pointer WRITE that used to live here (`batchLinkAvatars`) moved to
// `domain/character/persistence/avatar-link-write.ts` (2026-08-02): `characters` is CHARACTER's table, and a
// cross-domain write routes through the OWNING domain's persistence helper, delivered as an injected op
// (`AssetsContext.linkCharacterAvatars`, wired at `entry/compose/assets-character.ts`) — Tier-1-DB.md
// §"Cross-tier composition", Constitution.md §2. The READ above stays: `persistence/` IS the sanctioned home for a
// cross-domain read, and the candidate scan is assets' own sweep.
