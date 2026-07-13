// domain/assets/persistence/queries — all db access for the slice. `storeBlob` is the ONE site that calls
// both `cas.putBytes` and `db.insert(assets)` (the blob↔row pair has exactly one writer). Every user-facing
// read is owner-scoped in the WHERE, never a post-filter; `metadataForOwnerAndHash` is the sole exception,
// trusted only because the verb already resolved the owner via `loadCoParticipantOwner`.

import type {
  AssetBlobRef,
  AssetKind,
  AssetListItem,
  GalleryItemView,
  StoredAsset,
} from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { assets, galleryItems } from "@orb/db";
import type { AssetId, CharacterId, GalleryItemId, UserId } from "@orb/kit/ids";
import { isAnimated, sniffMime } from "@orb/kit/image-sniff";
import { and, asc, desc, eq, inArray, isNull, like, lt, or } from "drizzle-orm";
import type { Cas } from "#infra/storage";

const LIMIT_ONE = 1;
const OCTET_STREAM = "application/octet-stream";

interface StoreBlobInput {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
  readonly kind: AssetKind;
  readonly mime: string;
  readonly candidateId: AssetId;
  readonly now: number;
  readonly enforceMagic: boolean;
}

interface AssetMetadataRow {
  readonly mime: string;
  readonly size: number;
}

interface AssetCasRef {
  readonly ownerId: UserId;
  readonly hash: string;
  readonly mime: string;
}

/** An asset's `(ownerId, hash, mime)` by id alone — no owner scope, un-principal. Not a user-facing surface. */
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

/** The `(assetId, hash)` pairs owned by `ownerId` among `assetIds` — foreign/gone ids are simply absent. */
export async function selectOwnedAssetRefs(
  db: Db,
  ownerId: UserId,
  assetIds: readonly AssetId[],
): Promise<AssetBlobRef[]> {
  if (assetIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ assetId: assets.id, hash: assets.hash })
    .from(assets)
    .where(and(eq(assets.ownerId, ownerId), inArray(assets.id, [...assetIds])));
  return rows;
}

/** Every image asset id, all owners when `ownerId` omitted — a trusted system sweep, not user-facing. */
export async function listImageAssetIdRows(db: Db, ownerId?: UserId | null): Promise<AssetId[]> {
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

/** The `{mime,size}` of the caller's asset with this hash, or undefined (404) when not found / not theirs. */
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

/** The `{mime,size}` of a specific owner's asset with this hash — the roster-avatar path; the verb
 *  resolves the avatar owner via `loadCoParticipantOwner` before calling this. */
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

/** The CAS+row coherence primitive: put bytes to the owner's CAS, then upsert the index row by
 *  `(ownerId, hash)`. The one writer of the blob↔row pair. `enforceMagic` verifies claimed mime against
 *  the byte signature; a dedup conflict falls through to `assetIdForHash`. */
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
      // Computed once here so the grid + variant pipeline never re-sniff.
      animated: isAnimated(input.bytes),
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

interface ListOwnedInput {
  readonly ownerId: UserId;
  readonly kind: AssetKind | undefined;
  readonly limit: number;
  readonly cursor: number | undefined;
  readonly cursorId: AssetId | undefined;
}

/** Gallery v1: the caller's own assets, newest-first, keyset-paged (no offset, avoids skips/dupes). */
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
      animated: assets.animated,
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

interface OwnedAssetRow {
  readonly hash: string;
  readonly mime: string;
}

/** The `{hash,mime}` of the caller's asset by id, or undefined when not found / not theirs. */
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

interface InsertGalleryItemInput {
  readonly id: GalleryItemId;
  readonly assetId: AssetId;
  readonly subjectCharacterId: CharacterId | undefined;
  readonly now: number;
}

/** Insert a gallery item, upsert-guarded on `(assetId, subjectCharacterId)`; idempotent on conflict.
 *  SQLite treats NULL subjects as distinct under the unique index, so un-charactered adds always insert. */
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

/** The full `GalleryItemView` for one item, or undefined when gone. */
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
      animated: assets.animated,
      subjectCharacterId: galleryItems.subjectCharacterId,
      createdAt: galleryItems.createdAt,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(eq(galleryItems.id, galleryItemId))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner of a gallery item, resolved through the asset join (no stamped owner column). Undefined if gone. */
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

/** Delete a gallery item by id. The caller has already gated ownership via {@link galleryItemOwner}. */
export async function deleteGalleryItemRow(db: Db, galleryItemId: GalleryItemId): Promise<void> {
  await db.delete(galleryItems).where(eq(galleryItems.id, galleryItemId));
}

interface ListGalleryInput {
  readonly ownerId: UserId;
  readonly subjectCharacterId: CharacterId | undefined;
  readonly limit: number;
  readonly cursor: number | undefined;
  readonly cursorId: GalleryItemId | undefined;
}

interface GalleryExportRow {
  readonly assetId: AssetId;
  readonly subjectCharacterId: CharacterId | null;
  readonly createdAt: number;
}

/** Every curation row the owner holds, for a portability export. Ordered `(createdAt, id)` for deterministic bytes. */
export async function listGalleryItemsForExport(
  db: Db,
  ownerId: UserId,
): Promise<GalleryExportRow[]> {
  const rows = await db
    .select({
      assetId: galleryItems.assetId,
      subjectCharacterId: galleryItems.subjectCharacterId,
      createdAt: galleryItems.createdAt,
    })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(eq(assets.ownerId, ownerId))
    .orderBy(asc(galleryItems.createdAt), asc(galleryItems.id));
  return rows;
}

interface ImportGalleryItemInput {
  readonly id: GalleryItemId;
  readonly assetId: AssetId;
  readonly subjectCharacterId: CharacterId | null;
  readonly createdAt: number;
}

/** Restore one curation row, idempotently, keyed on `(assetId, subjectCharacterId)`. An explicit existence
 *  check (not `onConflictDoNothing`) because SQLite treats NULL subjects as distinct under the unique index. */
export async function importGalleryItem(
  db: Db,
  input: ImportGalleryItemInput,
): Promise<{ readonly created: boolean }> {
  const existing = await db
    .select({ id: galleryItems.id })
    .from(galleryItems)
    .where(
      and(
        eq(galleryItems.assetId, input.assetId),
        input.subjectCharacterId !== null
          ? eq(galleryItems.subjectCharacterId, input.subjectCharacterId)
          : isNull(galleryItems.subjectCharacterId),
      ),
    )
    .limit(LIMIT_ONE);
  if (existing[0] !== undefined) {
    return { created: false };
  }
  await db.insert(galleryItems).values({
    id: input.id,
    assetId: input.assetId,
    subjectCharacterId: input.subjectCharacterId,
    createdAt: input.createdAt,
  });
  return { created: true };
}

/** Gallery v2: the caller's gallery via the asset join, newest-first, keyset-paged by `(createdAt, id)`. */
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
      animated: assets.animated,
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
