// domain/assets/persistence/queries — ALL db access for the slice (queries only). The CAS+row coherence
// lives here too: `storeBlob` is the ONE site that calls `cas.putBytes` AND `db.insert(assets)`, so the
// blob↔row pair has exactly one writer (the `assets-single-writer` gate — no `cas.putBytes`/
// `db.insert(assets)` outside this file). The CAS handle is INJECTED (a function call, not a node:* import),
// so `persistence-no-io` holds: this file does no direct fetch/http/node I/O.
//
// Every USER-FACING read is owner-scoped (the `ownerId` predicate is part of the WHERE, never a post-filter),
// so a non-owner can never receive another user's row. The roster-avatar exception (PD-28) departs from this
// only at the `metadataForOwnerAndHash` call — the VERB has already resolved the owning co-participant
// (via the injected `loadCoParticipantOwner` op) and passes the confirmed owner, so this is a trusted lookup,
// not an ownership bypass. `ownerId` is `principal.userId` (§7.1) on the normal path; the `no-direct-users-
// read` chokepoint holds throughout.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { and, eq, like } from "drizzle-orm";
import type { Cas } from "#infra/storage";
import { sniffMime } from "../substrate/mime";

const LIMIT_ONE = 1;
const OCTET_STREAM = "application/octet-stream";

// File-local (not exported — types-in-contract): the persistence-internal arg bundle for `storeBlob`.
interface StoreBlobInput {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
  readonly kind: AssetKind;
  readonly mime: string;
  /** The candidate id minted by the verb (injected `newAssetId`); used only on a fresh insert — on a
   *  dedup conflict the EXISTING row's id is returned instead. */
  readonly candidateId: AssetId;
  /** Epoch-ms from the injected clock — stamps both the CAS mtime touch and `assets.uploadedAt`. */
  readonly now: number;
  /** Verify the claimed mime against the byte signature before anything reaches CAS (the upload boundary). */
  readonly enforceMagic: boolean;
}

// File-local read shape (not exported): the blob-serve gate's columns.
interface AssetMetadataRow {
  readonly mime: string;
  readonly size: number;
}

// File-local read shape (not exported): the CAS coordinates for an un-principal by-id bytes read.
interface AssetCasRef {
  readonly ownerId: UserId;
  readonly hash: string;
}

/** The `(ownerId, hash)` CAS coordinates of an asset by id ALONE — NO owner scope (D20). The embeddings
 *  indexer is a trusted SYSTEM consumer: vectors carry no `ownerId`, so the avatar-bytes re-read happens
 *  un-principal, keyed only by the branded id the `asset.created` event carried (the owner is then derived
 *  from the row to key the per-user CAS). NOT a user-facing surface — never routed through `getMetadata`'s
 *  owner gate; the only caller is `loadAssetBytes` (the indexer's canon re-reader). Undefined when absent. */
export async function loadAssetCasRefById(
  db: Db,
  assetId: AssetId,
): Promise<AssetCasRef | undefined> {
  const rows = await db
    .select({ ownerId: assets.ownerId, hash: assets.hash })
    .from(assets)
    .where(eq(assets.id, assetId))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** Every IMAGE asset id (`mime LIKE 'image/%'`), ALL owners — NO owner scope (D20). The embeddings BULK
 *  embed pass (PD-53) is a trusted SYSTEM sweep over the whole store: vectors carry no `ownerId`, so the
 *  enumeration happens un-principal, exactly like `loadAssetCasRefById` above. The mime filter is the
 *  "can the imageEmbed role handle it" gate — non-image assets (export zips) are never embedded. NOT a
 *  user-facing surface; the only caller is `listImageAssetIds` (the bulk pass's enumeration read). */
export async function listImageAssetIdRows(db: Db): Promise<AssetId[]> {
  const rows = await db.select({ id: assets.id }).from(assets).where(like(assets.mime, "image/%"));
  return rows.map((r) => r.id);
}

/** The id of the caller's asset with this hash, or undefined when they have none. Owner-scoped. */
export async function assetIdForHash(
  db: Db,
  ownerId: UserId,
  hash: string,
): Promise<AssetId | undefined> {
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.ownerId, ownerId), eq(assets.hash, hash)))
    .limit(LIMIT_ONE);
  return rows[0]?.id;
}

/** The `{mime,size}` of the caller's asset with this hash, or undefined (→ 404) when not found / not
 *  theirs. The blob-serve gate read — owner-scoped, no foreign-existence leak. */
export async function metadataForOwnedHash(
  db: Db,
  ownerId: UserId,
  hash: string,
): Promise<AssetMetadataRow | undefined> {
  const rows = await db
    .select({ mime: assets.mime, size: assets.size })
    .from(assets)
    .where(and(eq(assets.ownerId, ownerId), eq(assets.hash, hash)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The `{mime,size}` of a SPECIFIC OWNER'S asset with this hash (the PD-28 roster-avatar path: the
 *  caller has already been confirmed as a co-participant of the owner; we just read their metadata).
 *  The verb resolves the owning co-participant via `loadCoParticipantOwner` BEFORE calling this. */
export async function metadataForOwnerAndHash(
  db: Db,
  ownerId: UserId,
  hash: string,
): Promise<AssetMetadataRow | undefined> {
  const rows = await db
    .select({ mime: assets.mime, size: assets.size })
    .from(assets)
    .where(and(eq(assets.ownerId, ownerId), eq(assets.hash, hash)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/**
 * The CAS+row coherence primitive: put bytes to the owner's CAS, then upsert the index row by
 * `(ownerId, hash)`. The ONE writer of the blob↔row pair (shared by `store` and — when it lands —
 * `backfillAvatars`).
 *
 * `enforceMagic` (the upload boundary) verifies the claimed mime against the byte signature — two distinct
 * rejections kept legible (esoterica #7): `octet-stream` is the "unrecognized signature" sentinel (never a
 * valid claimed mime, we only serve PNG/JPEG/GIF/WebP), and a claimed-vs-sniffed mismatch is a renamed file.
 *
 * The upsert uses `onConflictDoNothing(target: [ownerId, hash]).returning({ id })`: one round-trip hands a
 * fresh insert's id back; on a dedup conflict RETURNING yields no row and we fall through to
 * `assetIdForHash` (the same lookup, scoped). A row missing after the upsert is an integrity fault (throws).
 * `created` reflects the CAS-level write (`put.created`) — within-user dedup ⇒ `false` (esoterica #4); in
 * the coherent slice flow this equals "a new row was inserted" (blob + row are written together here).
 */
export async function storeBlob(db: Db, cas: Cas, input: StoreBlobInput): Promise<StoredAsset> {
  if (input.enforceMagic) {
    const sniffed = sniffMime(input.bytes);
    if (sniffed === OCTET_STREAM) {
      throw new Error(
        `assets.store: unrecognized magic bytes — claimed ${input.mime}, no known image signature`,
      );
    }
    if (sniffed !== input.mime) {
      throw new Error(
        `assets.store: magic-byte mismatch — claimed ${input.mime}, sniffed ${sniffed}`,
      );
    }
  }

  const put = await cas.putBytes(input.ownerId, input.bytes, input.now);
  const inserted = await db
    .insert(assets)
    .values({
      id: input.candidateId,
      ownerId: input.ownerId,
      kind: input.kind,
      mime: input.mime,
      size: put.size,
      hash: put.hash,
      uploadedAt: input.now,
    })
    .onConflictDoNothing({ target: [assets.ownerId, assets.hash] })
    .returning({ id: assets.id });

  const assetId = inserted[0]?.id ?? (await assetIdForHash(db, input.ownerId, put.hash));
  if (assetId === undefined) {
    throw new Error(`assets.store: row missing after upsert (${put.hash})`);
  }
  return { assetId, hash: put.hash, size: put.size, created: put.created };
}
