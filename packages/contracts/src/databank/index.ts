// `@orb/contracts/databank` — the databank source-document ORIGIN axis, promoted to contracts so
// `@orb/db` can derive its `documents.origin` enum column from the ONE canonical tuple (the D34 pattern
// that already governs `workloads.kind`). `@orb/db` deps are `@orb/kit` + `@orb/contracts` + drizzle
// only, so a db enum column must reach its axis here, not in `domain/databank/contract/`.
//
// DB1 adds the wire surface with no db-column consumer: the chunk-param twin (pinned to `@orb/kit/chunk`'s
// ChunkParams by `satisfies` — drift fails tsc HERE, not at a call site), the retrieval/settings blobs, and
// the client-facing DocumentView. `extractedText` is deliberately NOT on DocumentView (list payloads would
// haul megabytes — a dedicated `get` with `includeText` returns it, databank-design/02 §4).

import type { ChunkParams } from "@orb/kit/chunk";
import type { DocumentId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The provenance of a databank document. ONE canonical tuple (§7.5 no-inline-union-redecl): the db
 *  `documents.origin` enum column derives from it, and the tRPC wire builds its `z.enum` from the same
 *  home. `text` = pasted/authored canon (no source bytes); the rest carry re-extractable source bytes or
 *  a scrape URL. */
export const DOC_ORIGINS = ["upload", "web", "youtube", "wiki", "text"] as const;

export const docOriginSchema = z.enum(DOC_ORIGINS);

export type DocOrigin = z.infer<typeof docOriginSchema>;

/** The scraper subset — DERIVED from the origin axis (not a second spelling). The origins whose bytes
 *  are fetched by a scraper rather than uploaded. */
export const SCRAPER_KINDS = ["web", "youtube", "wiki"] as const satisfies readonly DocOrigin[];

export const scraperKindSchema = z.enum(SCRAPER_KINDS);

export type ScraperKind = z.infer<typeof scraperKindSchema>;

/** The branded `documents.id` schema (strict TypeID — validates the `document_…` prefix at a boundary). */
export const documentIdSchema = typeIdSchema(ID_PREFIX.document);

/** The page `databank.list` serves when a caller names no `limit` — the verb's default, promoted here
 *  because the CLIENT has to know it too. A surface that summarizes the returned rows ("46 documents")
 *  is reporting a PAGE, and it can only say so honestly ("100+ documents") if it can tell a full page from
 *  a whole bank (side-eye 2026-08-08 P2-d). Two spellings of this number would make that "+" a lie the day
 *  either moved.
 *
 *  It is the default page for a caller that pages ONCE and summarizes (the home tile, the list band's
 *  count). The LIBRARY pane pages properly — `UserSettings.library.pageSize` per page, `cursor` for the
 *  rest — so it is not bounded by this number. */
export const DATABANK_LIST_DEFAULT_LIMIT = 100;

/** The keyset `databank.list` pages by — the boundary row's own `(updatedAt, id)`, because the list is
 *  ordered `updatedAt DESC, id DESC` and `updatedAt` is not unique (two documents written in the same
 *  millisecond, which a bulk import produces by the dozen). `id` breaks the tie, so no row is served twice
 *  and none is skipped. An OFFSET would do neither: it re-counts from the top of a list whose head moves
 *  every time an ingest bumps a row's `updatedAt` (the `character.list` keyset precedent). */
export const documentListCursorSchema = z.object({
  updatedAt: z.number().int(),
  id: documentIdSchema,
});

export type DocumentListCursor = z.infer<typeof documentListCursorSchema>;

// Chunk/retrieval bounds — named (contracts enforce no-magic-numbers). ST-derived defaults (databank-design
// /03 §1, /05 §3.7): 2500-char chunks, 0% overlap, ≤5 KB whole-file, k=5, minScore 0.25.
const CHUNK_SIZE_MIN = 200;
const CHUNK_SIZE_MAX = 20_000;
const CHUNK_SIZE_DEFAULT = 2500;
const OVERLAP_PERCENT_MAX = 50;
const WHOLE_FILE_THRESHOLD_MAX = 100_000;
const WHOLE_FILE_THRESHOLD_DEFAULT = 5120;
const RETRIEVAL_K_MAX = 50;
const RETRIEVAL_K_DEFAULT = 5;
const MIN_SCORE_DEFAULT = 0.25;

// ── chunk params (the wire twin of @orb/kit/chunk's ChunkParams; pinned by ChunkParamsPin below) ─────────
export const chunkParamsSchema = z.object({
  chunkSize: z.number().int().min(CHUNK_SIZE_MIN).max(CHUNK_SIZE_MAX).default(CHUNK_SIZE_DEFAULT), // chars — ST chunk_size_db
  overlapPercent: z.number().int().min(0).max(OVERLAP_PERCENT_MAX).default(0), // ST overlap_percent_db
  wholeFileThreshold: z.number().int().min(0).max(WHOLE_FILE_THRESHOLD_MAX).default(WHOLE_FILE_THRESHOLD_DEFAULT), // chars — ST size_threshold_db (5 KB)
});

export type ChunkParamsWire = z.infer<typeof chunkParamsSchema>;

/** Compile-time pin: the wire shape and `@orb/kit/chunk`'s `ChunkParams` are MUTUALLY assignable — any drift
 *  (a renamed/added/dropped field) fails tsc HERE, not at a call site. kit stays zod-free; contracts derives
 *  the wire twin and this type is the belt that keeps them one shape. Self-referenced by `_chunkParamsHolds`
 *  below (an UNREFERENCED conditional type is never evaluated, so the pin only bites when read) — which also
 *  makes it an own-file-consumed export, not orphan-ratchet parking-permit rot. */
export type ChunkParamsPin = ChunkParamsWire extends ChunkParams ? (ChunkParams extends ChunkParamsWire ? true : never) : never;
/** Forces tsc to EVALUATE {@link ChunkParamsPin}: a wire/kit drift makes the pin `never` and this `= true` fails. */
const _chunkParamsHolds: ChunkParamsPin = true;
void _chunkParamsHolds;

// ── retrieval settings (the user-setting blob; databank-design/08 §4 Q2) ─────────────────────────────────
export const databankRetrievalSettingsSchema = z.object({
  k: z.number().int().min(1).max(RETRIEVAL_K_MAX).default(RETRIEVAL_K_DEFAULT), // ST chunk_count_db
  minScore: z.number().min(0).max(1).default(MIN_SCORE_DEFAULT), // ST score_threshold
  rerank: z.boolean().default(false), // LEAN default off (databank-design/05 §3.5)
});
export type DatabankRetrievalSettings = z.infer<typeof databankRetrievalSettingsSchema>;

export const databankSettingsSchema = z.object({
  chunk: chunkParamsSchema,
  retrieval: databankRetrievalSettingsSchema,
});

export type DatabankSettings = z.infer<typeof databankSettingsSchema>;

// ── the client-facing document view (extractedText is NOT here — see the file header) ────────────────────
export const documentViewSchema = z.object({
  id: documentIdSchema,
  name: z.string().min(1),
  mime: z.string(),
  origin: docOriginSchema,
  sourceUrl: z.url().nullable(),
  byteSize: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(), // extractedText.length — derived at read
  chunkCount: z.number().int().nonnegative(), // derived (LEFT JOIN count; active model only)
  embeddedCount: z.number().int().nonnegative(), // = chunkCount when ingest is complete
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type DocumentView = z.infer<typeof documentViewSchema>;

// ── host per-document visibility override (D85 — the membership-widened chat scope's governance knob) ─────
// The chat-scope retrieval union widened from host-only to every present member's ATTACHED documents (D85,
// databank-design/05 §3.2). Widening is default-ON; the HOST retains an optional per-DOCUMENT override to
// EXCLUDE a specific document (a member's, or the room's) from the shared retrieval set — governable, not
// all-or-nothing. Home: a fault-isolated `chats.metadata` sub-blob (the `roomOverrides` precedent), WRITTEN
// by the host-gated `chat.setChatDocumentVisibility` verb and READ by `databank/persistence/scope.ts`. The
// schema lives HERE (documentId is databank vocab) and chat's metadata parser imports it — the providerRouting
// precedent (connection's schema, chat's parser). Per-DOCUMENT is the granularity that EXISTS (documents are
// flat — no folder/collection primitive); per-folder is a deferred future item riding a not-yet-minted
// collection primitive (D85). `hidden` is a SET of excluded document ids; an id not owned/attached is simply
// inert (the union filter is a membership subtraction, never a lookup).
export const chatDocumentVisibilitySchema = z.strictObject({
  hidden: z.array(documentIdSchema),
});

export type ChatDocumentVisibility = z.infer<typeof chatDocumentVisibilitySchema>;

/** Empty ⇒ nothing hidden; the widened union is retrieved in full (the off path). */
export const DEFAULT_CHAT_DOCUMENT_VISIBILITY: ChatDocumentVisibility = { hidden: [] };

// ── WHY a document is active in a chat (D-2, databank-surface-spec §11) ──────────────────────────────────
// The D85 union is THREE junction reads (`databank/persistence/scope.ts`): every present human member's
// GLOBAL documents ∪ the chat's directly-attached documents ∪ the present roster characters' documents. The
// resolver ran all three separately and then threw the provenance away, so the panel could say a document
// was active but never WHY — which is what made legacy render a read-only Switch as an information display
// (the affordance lie §2.2 files). This is that provenance, promoted to the wire as ONE tuple (§5.5).
//
// It is a LIST per document, not a single value: a member's global document can ALSO be chat-attached and
// ALSO ride a roster character. It is also the DETACHABILITY datum — only the `chat` junction belongs to
// this room, so a host may detach a `chat`-sourced document and can only HIDE any other (D85's visibility
// override is a retrieval switch, never a delete).
export const DOCUMENT_SCOPE_SOURCES = ["global", "chat", "character"] as const;

export type DocumentScopeSource = (typeof DOCUMENT_SCOPE_SOURCES)[number];

// ── reindex scope + mode (the cross-boundary maintenance axis) ───────────────────────────────────────────
// Both the tRPC `reindex` verb and the `databank-reindex` WORKLOAD params derive from these ONE schemas
// (§7.5 no-inline-union-redecl). `document` re-runs one document; `owner` re-runs every document the caller
// owns. `chunk-embed` covers a chunk-param or embed-model change (the hash/prune machinery finds the delta);
// `re-extract` additionally re-runs `infra/extraction` over the CAS bytes (extractor-upgrade sweep).
export const reindexModeSchema = z.enum(["chunk-embed", "re-extract"]);

export type ReindexMode = z.infer<typeof reindexModeSchema>;

export const reindexScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document"), documentId: documentIdSchema }),
  z.object({ kind: z.literal("owner") }),
]);

export type ReindexScope = z.infer<typeof reindexScopeSchema>;

// ── what became of a producer's DERIVED layer (the `UploadResult.ingest` axis) ───────────────────────────
// `queued` = the `databank-ingest` workload is enqueued (the normal path — the build never blocks the canon
// write). `skipped` = a `(ownerId, importHash)` dedup hit, whose chunks already exist. `not-queued` = the
// canon landed but the QUEUE refused the build: the document is real and readable, and un-indexed until a
// reindex.
//
// The third arm is why this is a tuple and not a boolean, and why it is CROSS-BOUNDARY vocabulary: the
// producer verbs write the `documents` row before enqueuing and the two are not one transaction, so a
// producer must be able to report a half-success — and the CLIENT is what tells the user which half
// (`add-document-dialog` renders a different sentence for it, and it must not re-spell the members).
export const INGEST_OUTCOMES = ["queued", "skipped", "not-queued"] as const;

export type IngestOutcome = (typeof INGEST_OUTCOMES)[number];

/** The `databank-ingest` / `databank-reindex` WORKLOAD result (per document, summed for an owner/bulk scope).
 *  It is the vector-layer accounting a reindex reports back — a cross-boundary shape because the workload row
 *  carries it as its result JSON the client reads. Partial failure is DATA (`failed`), never a throw: one bad
 *  document must not fail an owner-wide reindex. */
export interface IngestRunResult {
  readonly documents: number;
  /** written (new or changed hash). */
  readonly chunksUpserted: number;
  /** hash-gated skips — the idempotency observable. */
  readonly chunksNoop: number;
  readonly chunksPruned: number;
  /** `mode:'re-extract'` only — documents whose canon was re-derived from the CAS bytes. */
  readonly reExtracted: number;
  readonly failed: readonly { readonly documentId: DocumentId; readonly error: string }[];
}
