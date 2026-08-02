// domain/databank/persistence/queries — all db access for the documents producer + its scope junctions.
// Every owner-facing read is owner-scoped in the WHERE (fetchOwned — never a bare eq(id), a cross-tenant
// hole). `charCount`/`chunkCount` are DERIVED at read: `charCount` via SQL `length(extracted_text)` (so a
// list never hauls the multi-MB canon), the chunk counts via a GROUP BY over `document_chunks` scoped to the
// ACTIVE embed model (a stale-space row is not a live chunk). `document_chunks` is read-only here (the count);
// databank never writes it (the single-write-path invariant — writes ride `embeddings.store`).

import type { DocumentView } from "@orb/contracts/databank";
import type { Db } from "@orb/db";
import { characterDocuments, characters, chatDocuments, documents, globalDocuments } from "@orb/db";
import type { CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DatabankCharacterNotFoundError } from "../contract/errors";
import type { DocumentAttachmentsView } from "../contract/views";

const LIMIT_ONE = 1;

/** The list-safe projection: everything on `DocumentView` EXCEPT the derived chunk counts, with `charCount`
 *  computed in SQL so the canon text never crosses the wire on a list. Persistence-internal (not exported —
 *  the row type has no home outside this file; the verbs consume `toDocumentView`, not this shape). */
interface DocumentMetaRow {
  readonly id: DocumentId;
  readonly name: string;
  readonly mime: string;
  readonly origin: DocumentView["origin"];
  readonly sourceUrl: string | null;
  readonly byteSize: number;
  readonly charCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The full canon row (incl. `extractedText` + provenance) — for `get({includeText})` and the ingest/reindex
 *  paths (chunk source, re-extract). Persistence-internal; consumers derive it via
 *  `Awaited<ReturnType<typeof loadDocument>>` rather than re-declaring the db row type (its home is `@orb/db`). */
type DocumentRow = typeof documents.$inferSelect;

const META_COLUMNS = {
  id: documents.id,
  name: documents.name,
  mime: documents.mime,
  origin: documents.origin,
  sourceUrl: documents.sourceUrl,
  byteSize: documents.byteSize,
  charCount: sql<number>`length(${documents.extractedText})`,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
} as const;

/** Assemble the wire `DocumentView` from a meta row + the derived chunk counts. In the current substrate a
 *  `document_chunks` row exists only AFTER a successful embed, so `chunkCount === embeddedCount` (both are the
 *  live-row count for the active model); a partial ingest simply shows fewer of both. */
export function toDocumentView(meta: DocumentMetaRow, chunkCount: number): DocumentView {
  return {
    id: meta.id,
    name: meta.name,
    mime: meta.mime,
    origin: meta.origin,
    sourceUrl: meta.sourceUrl,
    byteSize: meta.byteSize,
    charCount: meta.charCount,
    chunkCount,
    embeddedCount: chunkCount,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export async function loadOwnedMeta(db: Db, ownerId: UserId, id: DocumentId): Promise<DocumentMetaRow | undefined> {
  const rows = await db
    .select(META_COLUMNS)
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The character-scope attach TARGET gate (DB8): the character must be the caller's own. Reads the `characters`
 *  schema directly — a sanctioned cross-table read (domain-no-cross-feature bans importing sibling RUNTIME,
 *  not the shared db schema; the world-info `ensureCharacterOwned` precedent). A foreign/absent character
 *  collapses to DatabankCharacterNotFoundError (no existence oracle). */
export async function ensureCharacterOwned(db: Db, ownerId: UserId, characterId: CharacterId): Promise<void> {
  const rows = await db.select({ ownerId: characters.ownerId }).from(characters).where(eq(characters.id, characterId)).limit(LIMIT_ONE);
  if (rows[0]?.ownerId !== ownerId) {
    throw new DatabankCharacterNotFoundError(characterId);
  }
}

/** The full owned row (incl. `extractedText`) — `get({includeText})`. Owner-scoped. */
export async function loadOwnedDocument(db: Db, ownerId: UserId, id: DocumentId): Promise<DocumentRow | undefined> {
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The full row by id ALONE — used by the ingest/reindex subsystem, which runs AFTER the enqueue authority
 *  check (the workload row's owner is the gate; the chunk FK is to this document). */
// @owner-scope-ok: D20 un-principal — ingest/reindex runs AFTER the enqueue authority check (the workload
// row's owner is the gate) over ids the enqueue itself resolved; the owner-facing read is `loadOwnedDocument`
// above. Ends the day ingest takes a documentId straight off a request.
export async function loadDocument(db: Db, id: DocumentId): Promise<DocumentRow | undefined> {
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(LIMIT_ONE);
  return rows[0];
}

/** The `(ownerId, importHash)` re-upload dedup probe — the unique index's meta row, or undefined. */
export async function findByImportHash(db: Db, ownerId: UserId, importHash: string): Promise<DocumentMetaRow | undefined> {
  const rows = await db
    .select(META_COLUMNS)
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.importHash, importHash)))
    .limit(LIMIT_ONE);
  return rows[0];
}

interface ListDocumentsQuery {
  readonly origin?: DocumentView["origin"];
  readonly limit: number;
  readonly offset: number;
}

export async function listOwnedMeta(db: Db, ownerId: UserId, query: ListDocumentsQuery): Promise<DocumentMetaRow[]> {
  const where = query.origin === undefined ? eq(documents.ownerId, ownerId) : and(eq(documents.ownerId, ownerId), eq(documents.origin, query.origin));
  const rows = await db.select(META_COLUMNS).from(documents).where(where).orderBy(desc(documents.updatedAt)).limit(query.limit).offset(query.offset);
  return rows;
}

/** Every owned document id (the `{ownerId}` reindex + personal-search scope) — id-only, no canon read. */
export async function listOwnedDocumentIds(db: Db, ownerId: UserId): Promise<DocumentId[]> {
  const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, ownerId));
  return rows.map((r) => r.id);
}

/** Every document id box-wide (the null-owner bulk reindex). */
export async function listAllDocumentIds(db: Db): Promise<DocumentId[]> {
  const rows = await db.select({ id: documents.id }).from(documents);
  return rows.map((r) => r.id);
}

/** Meta rows by id set (NO owner filter) — the room-public `listActiveForChat` read: a member views the
 *  HOST's active documents, so it can't owner-scope. The caller has already resolved the id set through the
 *  host-scoped junction union (scope.ts). Preserves the input id order for a stable list. */
// @owner-scope-ok: DELIBERATELY unscoped — the room-public `listActiveForChat` read. A member views the
// HOST's active documents, so an owner predicate on the CALLER would return nothing; the id set was already
// resolved through the host-scoped junction union (`scope.ts`), which is the authorization. This is the
// (b)-membership rung standing in for the (a) predicate. Ends if the id set stops coming from that union.
export async function loadMetaByIds(db: Db, ids: readonly DocumentId[]): Promise<DocumentMetaRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select(META_COLUMNS)
    .from(documents)
    .where(inArray(documents.id, [...ids]));
  // Reorder to the input id order (id sets are small — a chat's active docs); `find` avoids a query-layer Map.
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is DocumentMetaRow => r !== undefined);
}

/** Reverse of the scope junctions: where a document is attached. Owner-gated by the caller (loadOwnedMeta). */
export async function loadAttachments(db: Db, documentId: DocumentId): Promise<DocumentAttachmentsView> {
  const [globalRows, chatRows, characterRows] = await Promise.all([
    db.select({ documentId: globalDocuments.documentId }).from(globalDocuments).where(eq(globalDocuments.documentId, documentId)).limit(LIMIT_ONE),
    db.select({ chatId: chatDocuments.chatId }).from(chatDocuments).where(eq(chatDocuments.documentId, documentId)),
    db.select({ characterId: characterDocuments.characterId }).from(characterDocuments).where(eq(characterDocuments.documentId, documentId)),
  ]);
  return {
    global: globalRows.length > 0,
    chatIds: chatRows.map((r): ChatId => r.chatId),
    characterIds: characterRows.map((r): CharacterId => r.characterId),
  };
}
