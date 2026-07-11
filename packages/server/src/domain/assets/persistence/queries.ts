// domain/assets/persistence/queries — ALL db access for the slice (queries only). The CAS+row coherence
// lives here too: `storeBlob` is the ONE site that calls `cas.putBytes` AND `db.insert(assets)`, so the
// blob↔row pair has exactly one writer (the `assets-single-writer` gate — no `cas.putBytes`/
// `db.insert(assets)` outside this file). The CAS handle is INJECTED (a function call, not a node:* import),
// so `persistence-no-io` holds: this file does no direct fetch/http/node I/O.
//
// Every USER-FACING read is owner-scoped (the `ownerId` predicate is part of the WHERE, never a post-filter),
// so a non-owner can never receive another user's row. The roster-avatar exception (PD-28 / D21) departs from
// this only at the `metadataForOwnerAndHash` call — the VERB has already resolved the avatar's owner via the
// injected `loadCoParticipantOwner` reference-check (the hash must be a rostered character's `avatarAssetId`
// in a chat the caller is present in — NOT a bare co-participant hash oracle, PD-107) and passes that
// confirmed owner, so this is a trusted lookup, not an ownership bypass. `ownerId` is `principal.userId`
// (§7.1) on the normal path; the `no-direct-users-read` chokepoint holds throughout.

import type { AssetKind, AssetListItem, GalleryItemView, StoredAsset } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets, galleryItems } from "@orb/db";
import type { AssetId, CharacterId, GalleryItemId, UserId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import { and, desc, eq, isNull, like, lt, or } from "drizzle-orm";
import type { Cas } from "#infra/storage";

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

// File-local read shape (not exported): owner + CAS hash + mime for an un-principal by-id lookup.
interface AssetCasRef {
  readonly ownerId: UserId;
  readonly hash: string;
  readonly mime: string;
}

/** An asset's `(ownerId, hash, mime)` by id ALONE — NO owner scope (D20). Un-principal: keyed only by the
 *  branded id, the owner derived FROM the row (to key the per-user CAS), never a `getMetadata` owner gate.
 *  Two trusted callers: `loadAssetBytes` (the embeddings indexer's canon re-reader — uses owner+hash) and
 *  `assetCasRefById` (the chat image-resolution verb — uses owner for the chat-scoped reference gate + mime
 *  for the data-URI). NOT a user-facing surface. Undefined when absent. */
export async function loadAssetCasRefById(
  db: Db,
  assetId: AssetId,
): Promise<AssetCasRef | undefined> {
  const rows = await db
    .select({ ownerId: assets.ownerId, hash: assets.hash, mime: assets.mime })
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
export async function listImageAssetIdRows(db: Db, ownerId?: UserId | null): Promise<AssetId[]> {
  // `ownerId` scopes the sweep to ONE owner (the workloads SINGULAR mode — embed MY assets); omitted/null =
  // every owner (the BULK dev sweep, D20 un-principal). The mime filter always applies (image-only).
  const scope =
    ownerId === undefined || ownerId === null
      ? like(assets.mime, "image/%")
      : and(like(assets.mime, "image/%"), eq(assets.ownerId, ownerId));
  const rows = await db.select({ id: assets.id }).from(assets).where(scope);
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

/** The `{mime,size}` of a SPECIFIC OWNER'S asset with this hash (the PD-28 / D21 roster-avatar path: the
 *  hash has already been confirmed as a rostered character's `avatarAssetId` in a chat the caller is
 *  present in, and `ownerId` is that avatar asset's owner; we just read its metadata). The verb resolves
 *  the avatar owner via the `loadCoParticipantOwner` reference-check BEFORE calling this. */
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

// File-local (not exported — types-in-contract): the keyset-paged owned-asset list args.
interface ListOwnedInput {
  readonly ownerId: UserId;
  readonly kind: AssetKind | undefined;
  readonly limit: number;
  /** `uploadedAt` of the previous page's last row (the keyset cursor); paired with `cursorId`. */
  readonly cursor: number | undefined;
  /** `id` of that same row — the deterministic tiebreak (bulk import stamps one `uploadedAt` on many rows). */
  readonly cursorId: AssetId | undefined;
}

/** Gallery v1 (§1.2): the caller's own assets, `ORDER BY uploadedAt DESC, id DESC`, keyset-paged. The
 *  cursor predicate is `uploadedAt < :cursor OR (uploadedAt = :cursor AND id < :cursorId)` — no offset (which
 *  skips/dupes rows under concurrent writes/GC). Owner-scoped in the WHERE (never a post-filter); optional
 *  `kind` filter. Returns `AssetListItem[]` verbatim (the client derives the next cursor from the last row). */
export async function listOwnedAssetRows(db: Db, input: ListOwnedInput): Promise<AssetListItem[]> {
  const keyset =
    input.cursor !== undefined && input.cursorId !== undefined
      ? or(
          lt(assets.uploadedAt, input.cursor),
          and(eq(assets.uploadedAt, input.cursor), lt(assets.id, input.cursorId)),
        )
      : undefined;
  const rows = await db
    .select({
      assetId: assets.id,
      hash: assets.hash,
      kind: assets.kind,
      mime: assets.mime,
      size: assets.size,
      uploadedAt: assets.uploadedAt,
    })
    .from(assets)
    .where(
      and(
        eq(assets.ownerId, input.ownerId),
        input.kind !== undefined ? eq(assets.kind, input.kind) : undefined,
        keyset,
      ),
    )
    .orderBy(desc(assets.uploadedAt), desc(assets.id))
    .limit(input.limit);
  return rows;
}

// File-local (not exported): the `{hash,mime}` of an owned asset by id — the addToGallery owner gate (the
// assetId-keyed sibling of `metadataForOwnedHash`).
interface OwnedAssetRow {
  readonly hash: string;
  readonly mime: string;
}

/** The `{hash,mime}` of the caller's asset by id, or undefined when not found / not theirs. The owner gate
 *  `addToGallery` runs before curating (a gallery row must never reference another user's asset — §1.3). */
export async function ownedAssetForGallery(
  db: Db,
  ownerId: UserId,
  assetId: AssetId,
): Promise<OwnedAssetRow | undefined> {
  const rows = await db
    .select({ hash: assets.hash, mime: assets.mime })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

// File-local (not exported): the upsert-guarded gallery-item insert args.
interface InsertGalleryItemInput {
  readonly id: GalleryItemId;
  readonly assetId: AssetId;
  readonly subjectCharacterId: CharacterId | undefined;
  /** Epoch-ms from the injected clock — stamps `gallery_items.createdAt` (the DB default is a fallback). */
  readonly now: number;
}

/** Insert a gallery item, upsert-guarded on `(assetId, subjectCharacterId)`. On a conflict (only fires for a
 *  NON-null subject — SQLite treats NULL subjects as distinct under the unique index, so un-charactered adds
 *  always insert; harmless per §1.3) the existing row's id is returned instead → the add is idempotent.
 *  Returns the effective `GalleryItemId`. */
export async function insertGalleryItem(
  db: Db,
  input: InsertGalleryItemInput,
): Promise<GalleryItemId> {
  const inserted = await db
    .insert(galleryItems)
    .values({
      id: input.id,
      assetId: input.assetId,
      subjectCharacterId: input.subjectCharacterId ?? null,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: [galleryItems.assetId, galleryItems.subjectCharacterId] })
    .returning({ id: galleryItems.id });
  if (inserted[0] !== undefined) {
    return inserted[0].id;
  }
  const existing = await db
    .select({ id: galleryItems.id })
    .from(galleryItems)
    .where(
      and(
        eq(galleryItems.assetId, input.assetId),
        input.subjectCharacterId !== undefined
          ? eq(galleryItems.subjectCharacterId, input.subjectCharacterId)
          : isNull(galleryItems.subjectCharacterId),
      ),
    )
    .limit(LIMIT_ONE);
  const existingId = existing[0]?.id;
  if (existingId === undefined) {
    throw new Error("assets.addToGallery: row missing after upsert conflict");
  }
  return existingId;
}

/** The full `GalleryItemView` for one item (joins `assets` for `hash`/`mime`), or undefined when gone. Built
 *  after an insert/upsert so the returned view is authoritative (the conflict path resolves to the existing
 *  row's createdAt/id, not the just-minted candidate). */
export async function galleryItemViewById(
  db: Db,
  galleryItemId: GalleryItemId,
): Promise<GalleryItemView | undefined> {
  const rows = await db
    .select({
      galleryItemId: galleryItems.id,
      assetId: galleryItems.assetId,
      hash: assets.hash,
      mime: assets.mime,
      subjectCharacterId: galleryItems.subjectCharacterId,
      createdAt: galleryItems.createdAt,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(eq(galleryItems.id, galleryItemId))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner of a gallery item, resolved THROUGH the asset join (`gallery_items → assets.ownerId`) — there
 *  is no stamped owner column (§1.3). Undefined when the item is gone. `removeFromGallery` compares this to
 *  the actor and rejects a non-owner (leak-free). */
export async function galleryItemOwner(
  db: Db,
  galleryItemId: GalleryItemId,
): Promise<UserId | undefined> {
  const rows = await db
    .select({ ownerId: assets.ownerId })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(eq(galleryItems.id, galleryItemId))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId;
}

/** Delete a gallery item by id. The caller (`removeFromGallery`) has already gated ownership via
 *  {@link galleryItemOwner}; this is the unconditional delete of the confirmed-owned row. */
export async function deleteGalleryItemRow(db: Db, galleryItemId: GalleryItemId): Promise<void> {
  await db.delete(galleryItems).where(eq(galleryItems.id, galleryItemId));
}

// File-local (not exported): the keyset-paged gallery list args.
interface ListGalleryInput {
  readonly ownerId: UserId;
  readonly subjectCharacterId: CharacterId | undefined;
  readonly limit: number;
  readonly cursor: number | undefined;
  readonly cursorId: GalleryItemId | undefined;
}

/** Gallery v2 (§1.3): the caller's gallery via the asset join filtered on `assets.ownerId = actor` (no
 *  stamped owner column to scope on), `ORDER BY createdAt DESC, id DESC`, keyset-paged by `(createdAt, id)`.
 *  Optional `subjectCharacterId` filter. */
export async function listGalleryViewRows(
  db: Db,
  input: ListGalleryInput,
): Promise<GalleryItemView[]> {
  const keyset =
    input.cursor !== undefined && input.cursorId !== undefined
      ? or(
          lt(galleryItems.createdAt, input.cursor),
          and(eq(galleryItems.createdAt, input.cursor), lt(galleryItems.id, input.cursorId)),
        )
      : undefined;
  const rows = await db
    .select({
      galleryItemId: galleryItems.id,
      assetId: galleryItems.assetId,
      hash: assets.hash,
      mime: assets.mime,
      subjectCharacterId: galleryItems.subjectCharacterId,
      createdAt: galleryItems.createdAt,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(
      and(
        eq(assets.ownerId, input.ownerId),
        input.subjectCharacterId !== undefined
          ? eq(galleryItems.subjectCharacterId, input.subjectCharacterId)
          : undefined,
        keyset,
      ),
    )
    .orderBy(desc(galleryItems.createdAt), desc(galleryItems.id))
    .limit(input.limit);
  return rows;
}
