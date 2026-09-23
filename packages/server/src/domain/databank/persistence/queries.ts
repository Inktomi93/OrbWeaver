// domain/databank/persistence/queries — all db access for the documents producer + its scope junctions.
// Every owner-facing read is owner-scoped in the WHERE (fetchOwned — never a bare eq(id), a cross-tenant
// hole). `charCount`/`chunkCount` are DERIVED at read: `charCount` via SQL `length(extracted_text)` (so a
// list never hauls the multi-MB canon), the chunk counts via a GROUP BY over `document_chunks` scoped to the
// ACTIVE embed model (a stale-space row is not a live chunk). `document_chunks` is read-only here (the count);
// databank never writes it (the single-write-path invariant — writes ride `embeddings.store`).

import type { DocumentListCursor, DocumentView } from "@orb/contracts/databank";
import { STALE_INGEST_MS } from "@orb/contracts/databank";
import type { Db } from "@orb/db";
import { characterDocuments, characters, chatDocuments, documents, globalDocuments } from "@orb/db";
import type { CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, gt, inArray, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { DatabankCharacterNotFoundError } from "../contract/errors.ts";
import type { DocumentListFilter, DocumentPhaseScope } from "../contract/params.ts";
import type { DocumentAttachmentRows } from "../contract/views.ts";

const LIMIT_ONE = 1;

/** The canon length, in SQL — the `charCount` projection AND the `empty`/in-flight phase predicates read this
 *  one expression, so a list can never disagree with the lens that filtered it. `length()` never hauls the
 *  multi-MB text. */
const CHAR_COUNT = sql<number>`length(${documents.extractedText})`;

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
  charCount: CHAR_COUNT,
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
// @orb-waive owner-scoped-reads(documents): D20 un-principal — ingest/reindex runs AFTER the enqueue authority check (the workload row's owner is the gate) over ids the enqueue itself resolved; the owner-facing read is `loadOwnedDocument` above. Ends the day ingest takes a documentId straight off a request.
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
  readonly filter: DocumentListFilter;
  readonly limit: number;
  /** The boundary row of the previous page — omit for the first page. */
  readonly cursor?: DocumentListCursor;
}

/** The SEARCH predicate — the one string the row itself renders that a user can type. The rest of a databank
 *  row is derived labels (provenance · size · passages), and its canon is deliberately never scanned here:
 *  content search is `search.documents`, a semantic retrieval over embedded chunks, not a library filter. */
function searchPredicate(needle: string): SQL {
  return sql`lower(${documents.name}) like ${`%${needle}%`}`;
}

/** No row can satisfy this. Used for the `embedding` phase, which is UNSATISFIABLE in the current substrate:
 *  a `document_chunks` row exists only AFTER a successful embed, so `embeddedCount === chunkCount` for every
 *  document (`toDocumentView` states the same identity), and "chunks exist that are not all embedded" names a
 *  state the data cannot be in. Spelled as an explicit empty predicate rather than omitted, because omitting
 *  it would silently serve the WHOLE bank for that chip — the loudest possible wrong answer. It stops being
 *  empty the day embeddings can report the two counts apart. */
const NO_DOCUMENT: SQL = sql`1 = 0`;

/** The ingest PHASE as a predicate over the same scope the page windows (owner ruling 2026-08-13). The
 *  arithmetic is `features/databank/lib/databank-model.ts`'s `countedPhase` + its stall overlay, expressed in
 *  SQL over the two facts that live on the row (canon length, `updatedAt`) and the one that does not (chunk
 *  presence, which arrives as an id set from embeddings — databank never reads the vector table).
 *
 *  `empty` is tested FIRST in the client's derivation, so it is charCount alone here too: a document that
 *  extracted to nothing is never "queued", however long it sits. */
function phasePredicate(scope: DocumentPhaseScope): SQL {
  const { phase, chunkedIds, nowMs } = scope;
  const hasCanon = gt(CHAR_COUNT, 0);
  // An empty id set means NOTHING is chunked — `inArray(col, [])` is not a portable way to say that, so the
  // two arms are spelled explicitly.
  const chunked = chunkedIds.length === 0 ? NO_DOCUMENT : inArray(documents.id, [...chunkedIds]);
  const unchunked = chunkedIds.length === 0 ? sql`1 = 1` : notInArray(documents.id, [...chunkedIds]);
  const frozenAt = nowMs - STALE_INGEST_MS;
  switch (phase) {
    case "empty":
      return eq(CHAR_COUNT, 0);
    case "indexing":
      // In flight and still moving: canon, no chunks yet, written inside the stall window.
      return and(hasCanon, unchunked, gt(documents.updatedAt, frozenAt)) ?? NO_DOCUMENT;
    case "embedding":
      return NO_DOCUMENT;
    case "ready":
      return and(hasCanon, chunked) ?? NO_DOCUMENT;
    case "stalled":
      // The same in-flight shape whose `updatedAt` stopped moving — the only "this is never coming back"
      // signal a schema with no status column can give.
      return and(hasCanon, unchunked, lte(documents.updatedAt, frozenAt)) ?? NO_DOCUMENT;
    default:
      return assertNeverPhase(phase);
  }
}

const assertNeverPhase = (value: never): never => {
  throw new Error(`unhandled document ingest phase: ${String(value)}`);
};

/** The ONE place the list's owner scope + lens predicates are spelled, so a page and its census can never
 *  disagree about what they are a window into / a count of (the `ownedCharacterScope` precedent). */
function ownedDocumentScope(ownerId: UserId, filter: DocumentListFilter): SQL | undefined {
  return and(
    eq(documents.ownerId, ownerId),
    filter.origin === undefined ? undefined : eq(documents.origin, filter.origin),
    filter.search === undefined ? undefined : searchPredicate(filter.search),
    filter.phase === undefined ? undefined : phasePredicate(filter.phase),
  );
}

/** One page of the owner's documents, LENS-filtered, `updatedAt DESC, id DESC`. The ORDER carries `id`
 *  because `updatedAt` is not unique, and the KEYSET predicate is the lexicographic "strictly after the
 *  boundary row" test on that same pair — so the page a cursor names is stable even while an ingest is
 *  bumping `updatedAt` on rows above it, which is exactly what an OFFSET cannot promise (it would re-serve or
 *  skip rows as the head shifts under it). */
export async function listOwnedMeta(db: Db, ownerId: UserId, query: ListDocumentsQuery): Promise<DocumentMetaRow[]> {
  const scope = ownedDocumentScope(ownerId, query.filter);
  const after =
    query.cursor === undefined
      ? undefined
      : or(lt(documents.updatedAt, query.cursor.updatedAt), and(eq(documents.updatedAt, query.cursor.updatedAt), lt(documents.id, query.cursor.id)));
  const rows = await db
    .select(META_COLUMNS)
    .from(documents)
    .where(after === undefined ? scope : and(scope, after))
    .orderBy(desc(documents.updatedAt), desc(documents.id))
    .limit(query.limit);
  return rows;
}

/** The list's CENSUS — how many documents match the SAME lens the page above is a window into. A real
 *  `COUNT`, never `items.length`: a keyset page's row count is a number that means something else, and the
 *  band header + home tile print this one ("46 documents", where they used to print "100+" because a full
 *  first page was all they had). */
export async function countOwnedDocuments(db: Db, ownerId: UserId, filter: DocumentListFilter): Promise<number> {
  const rows = await db.select({ total: count() }).from(documents).where(ownedDocumentScope(ownerId, filter));
  return rows.at(0)?.total ?? 0;
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
// @orb-waive owner-scoped-reads(documents): DELIBERATELY unscoped — the room-public `listActiveForChat` read. A member views the HOST's active documents, so an owner predicate on the CALLER would return nothing; the id set was already resolved through the host-scoped junction union (`scope.ts`), which is the authorization. This is the (b)-membership rung standing in for the (a) predicate. Ends if the id set stops coming from that union.
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

/** The caller's GLOBAL document ids — the library row's `Everywhere` state, as
 *  ONE read instead of a `listAttachments` per row. Owner-scoped on the junction's own `ownerId` column (the
 *  scope subject, D23), so a document another user made global is unreachable here. */
export async function listGlobalDocumentIds(db: Db, ownerId: UserId): Promise<DocumentId[]> {
  const rows = await db.select({ documentId: globalDocuments.documentId }).from(globalDocuments).where(eq(globalDocuments.ownerId, ownerId));
  return rows.map((r) => r.documentId);
}

/**
 * Reverse of the scope junctions: where a document is attached, as far as THIS file can answer it. Owner-gated
 * by the caller (`loadOwnedMeta`).
 *
 * The CHARACTERS come back NAMED, because both sides of that junction are the caller's: the join is
 * owner-scoped on `characters.ownerId` (the `ensureCharacterOwned` predicate, as a filter rather than a
 * throw), so a character that is somehow not the caller's simply does not appear. Ordered by name — the
 * server can sort what it can name.
 *
 * The CHATS come back as bare IDS on purpose. Which of them the caller may SEE is chat's membership question
 * (D18 — no `chats.ownerId`), and a domain reads neither the roster nor `chats`; the verb resolves them
 * through the injected `resolveVisibleRooms`. All this file knows is which rooms the junction points at.
 */
export async function loadAttachments(db: Db, ownerId: UserId, documentId: DocumentId): Promise<DocumentAttachmentRows> {
  const [globalRows, chatRows, characterRows] = await Promise.all([
    db.select({ documentId: globalDocuments.documentId }).from(globalDocuments).where(eq(globalDocuments.documentId, documentId)).limit(LIMIT_ONE),
    db.select({ chatId: chatDocuments.chatId }).from(chatDocuments).where(eq(chatDocuments.documentId, documentId)),
    db
      .select({ id: characterDocuments.characterId, name: characters.name })
      .from(characterDocuments)
      .innerJoin(characters, eq(characters.id, characterDocuments.characterId))
      .where(and(eq(characterDocuments.documentId, documentId), eq(characters.ownerId, ownerId)))
      .orderBy(asc(characters.name)),
  ]);
  return {
    global: globalRows.length > 0,
    chatIds: chatRows.map((r): ChatId => r.chatId),
    characters: characterRows,
  };
}
