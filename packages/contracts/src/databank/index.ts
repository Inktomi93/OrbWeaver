import type { VisibleRoomRef } from "../chat/visible-rooms.ts";
import { visibleRoomRefSchema } from "../chat/visible-rooms.ts";
// `@orb/contracts/databank` — the databank source-document ORIGIN axis, promoted to contracts so
// `@orb/db` can derive its `documents.origin` enum column from the ONE canonical tuple (the D34 pattern
// that already governs `workloads.kind`). `@orb/db` deps are `@orb/kit` + `@orb/contracts` + drizzle
// only, so a db enum column must reach its axis here, not in `domain/databank/contract/`.
//
// DB1 adds the wire surface with no db-column consumer: the chunk-param twin (pinned to `@orb/kit/chunk`'s
// ChunkParams by `satisfies` — drift fails tsc HERE, not at a call site), the retrieval/settings blobs, and
// the client-facing DocumentView. `extractedText` is deliberately NOT on DocumentView (list payloads would
// haul megabytes — a dedicated `get` with `includeText` returns it).

import type { ChunkParams } from "@orb/kit/chunk";
import type { CharacterId, DocumentId, WorkloadId } from "@orb/kit/ids";
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
export const documentIdSchema = typeIdSchema(ID_PREFIX.document) satisfies z.ZodType<DocumentId>;

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

// ── the ingest PHASE axis (a WIRE lens as of 2026-08-14) ──────────────────────────────────────────────────
// The phase a document's ingest is in. It is DERIVED, never stamped — there is no status column:
// `empty` = extracted to nothing · `indexing` = canon but no chunks yet ·
// `embedding` = chunks exist that are not all embedded · `ready` = every chunk embedded · `stalled` = an
// in-flight phase whose `updatedAt` stopped moving ({@link STALE_INGEST_MS}).
//
// THE VOCABULARY LIVES HERE, not in the client, because the phase became a LIST LENS the SERVER resolves
// (owner ruling 2026-08-13, `paged-list-lenses-go-server-side`): `databank.list` takes it as an input and
// narrows the whole bank by it, so it is cross-boundary shape. It previously homed in the client's
// `databank-filter-store`, whose header reasoned "ingest phase is a CLIENT DERIVATION over counts the list
// already returns … No server read changes" — true of a client-side scope over a loaded window, and exactly
// what the ruling retired. The client still derives the phase it RENDERS per row; both tiers now speak this
// one tuple and measure the stall against this one threshold.
export const INGEST_PHASES = ["empty", "indexing", "embedding", "ready", "stalled"] as const;

/** Derived from the TUPLE, not `z.infer` of the schema below (the `CharacterListSort` spelling): the
 *  vocabulary's type face lives at the tuple, its one home. Both give tsc the same type, but Biome 2.5.1 still
 *  reports every `case` of an exhaustive switch over the `z.infer` alias as
 *  `lint/suspicious/noUnnecessaryConditions` "unreachable", while the tuple-derived alias lints clean (probe
 *  from untracked files under `packages/contracts/src/` and `packages/server/src/`, never /tmp where zod does
 *  not resolve). The `satisfies` below is a ONE-WAY assignability check; the `zod-output-twin-parity` gate is what proves the schema output and this
 *  type are exactly equal. */
export type IngestPhase = (typeof INGEST_PHASES)[number];

export const ingestPhaseSchema = z.enum(INGEST_PHASES) satisfies z.ZodType<IngestPhase>;

/** A document still in an IN-FLIGHT phase this long after its last write reads as a STUCK job. Derived from
 *  `updatedAt` because there is no status column: a live ingest bumps `updatedAt` as chunks land, so a frozen
 *  timestamp is the only stall signal the schema can offer. 5 minutes clears a slow-but-live large-doc embed
 *  while flagging a genuinely wedged one. ONE home: the server's `phase: 'stalled'` SQL predicate and the
 *  client's rendered chip must agree about which documents are wedged, or the lens and the badge disagree on
 *  the same row. */
export const STALE_INGEST_MS = 300_000;

/** The bank's ingest health, COUNTED (the home tile's D-7 line + its attention chips). Every number is a
 *  census over the caller's whole bank, which is what makes the chips honest: they used to be derived from
 *  the tile's ONE loaded page, so "12 stalled" meant "12 stalled among your newest 100 documents" — the same
 *  blind-lens class as a client-side list filter, wearing a tile (owner ruling 2026-08-14).
 *
 *  It is a SEPARATE read from `databank.list`, deliberately: resolving it costs a bank-wide chunk read, and
 *  folding that into the paged list would pay it on every page fetch of a library the user is scrolling.
 *
 *  `passages` (embedded) and `chunks` (existing) are two numbers because the line prints both — a bare
 *  "286 passages indexed" reads as a complete count (side-eye 2026-08-08 P2-e). In the current substrate a
 *  chunk row exists only AFTER a successful embed, so the two are equal; they are not one field because the
 *  day a partial embed becomes representable is the day the line has something to say. */
export interface BankHealthView {
  /** Documents in the bank. */
  readonly total: number;
  /** Chunks a chat can actually retrieve (embedded). */
  readonly passages: number;
  /** Chunks that exist — the denominator that makes `passages` legible. */
  readonly chunks: number;
  /** How many documents are in each phase. A total Record (§5.5): a new phase must be counted, not forgotten. */
  readonly byPhase: Record<IngestPhase, number>;
  /** Documents with a stored source file whose text came from an older extractor: exactly the set an
   *  owner-wide re-extract sweep would rewrite. The databank header offers that sweep while this is above zero. */
  readonly staleExtraction: number;
}

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

// Chunk/retrieval bounds — named (contracts enforce no-magic-numbers). ST-derived defaults:
// 2500-char chunks, 0% overlap, ≤5 KB whole-file, k=5, minScore 0.25.
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

// ── retrieval settings (the user-setting blob) ────────────────────────────────────────────────────────────
export const databankRetrievalSettingsSchema = z.object({
  k: z.number().int().min(1).max(RETRIEVAL_K_MAX).default(RETRIEVAL_K_DEFAULT), // ST chunk_count_db
  minScore: z.number().min(0).max(1).default(MIN_SCORE_DEFAULT), // ST score_threshold
  rerank: z.boolean().default(false), // LEAN default off
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
// The chat-scope retrieval union widened from host-only to every present member's ATTACHED documents (D85).
// Widening is default-ON; the HOST retains an optional per-DOCUMENT override to
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

// ── WHY a document is active in a chat ──────────────────────────────────
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

/** `get({ includeText })` — the panel's source view. `extractedText` present iff asked (list payloads never
 *  haul the canon). The re-extract-on-upgrade prompt reads {@link BankHealthView.staleExtraction}, an
 *  owner-wide count, never a per-document version. */
export interface DocumentDetailView extends DocumentView {
  readonly extractedText?: string;
}

/** One CHARACTER that carries this document, as the CONTEXT roster prints it: the id its door navigates to
 *  and the name it shows. A character HAS a name — one authored string the row owns — so unlike a room this
 *  needs no chain and no membership filter, only the owner scope the junction already has (`characters` is
 *  owner-stamped, and `attachToCharacter` gates on it). */
export interface DocumentCharacterRef {
  readonly id: CharacterId;
  readonly name: string;
}

/**
 * Reverse of the scope junctions: where a document is attached (the CONTEXT panel's "Active in" roster +
 * detach UX). `global` is a boolean (single-owned personal bank).
 *
 * NAMES, NOT IDS (#276, 2026-08-19). This used to hand back `chatIds`/`characterIds`, which is why the pane
 * above it could only render two integers and why its no-selection copy had to downgrade its promise. The
 * two scopes resolve differently and the difference is the whole design:
 *   • CHARACTERS are a cheap owner-scoped join — the caller owns both sides of that junction.
 *   • CHATS are membership-scoped (D18 — chats carry no `ownerId`) and `attachToChat` is HOST authority, so
 *     a `chat_documents` row OUTLIVES its attacher's seat. Naming those ids straight off the junction would
 *     tell an ex-host that a room they can no longer open still exists and still feeds on their document.
 *     They resolve through the injected `resolveVisibleRooms` (`@orb/contracts/chat`), which answers PRESENT
 *     membership only and drops the rest — no residue, no count of what was dropped.
 */
export interface DocumentAttachmentsView {
  readonly global: boolean;
  /** The rooms the CALLER may see, newest-first, carrying the client title chain's inputs. A room the caller
   *  has left is absent — the count is the visible count, deliberately (a "…and 2 more" would leak it). */
  readonly chats: readonly VisibleRoomRef[];
  readonly characters: readonly DocumentCharacterRef[];
}

/** `listActiveForChat` row (D85): a document ACTIVE for the chat's retrieval union + its host-visibility state.
 *  `hidden` = the host excluded it from retrieval (`chats.metadata.databankVisibility`). Only the HOST ever
 *  receives hidden rows (they own the toggle); a member's payload is filtered to the visible set, so a member
 *  never learns a host-hidden document's name (`hidden` is always `false` in a member's payload). */
export interface ActiveChatDocumentView extends DocumentView {
  readonly hidden: boolean;
  /** WHY this document is active (D-2): the scope junction(s) crediting it — `global` (a present member's
   *  global attachment) · `chat` (attached to THIS chat) · `character` (on a present roster character). A
   *  document can be credited by several at once. Never empty: a row exists only because a junction put it
   *  there. It is also the DETACHABILITY datum — only `chat` is a junction this room's host owns, so a row
   *  without it can be HIDDEN but never detached from here. */
  readonly sources: readonly DocumentScopeSource[];
}

/** The producer verbs' return. `outcome:'duplicate'` = the `(ownerId, importHash)` unique hit (the existing
 *  document is returned, ingest skipped — its chunks already exist / are healing anyway). `warning` surfaces a
 *  succeeded-but-empty extraction (a scanned image-only PDF; `charCount ≈ 0`) — DATA, not a throw. */
export interface UploadResult {
  readonly document: DocumentView;
  readonly outcome: "created" | "duplicate";
  readonly ingest: IngestOutcome;
  readonly warning?: "empty-extraction";
}

/** One page of `list`. `nextCursor` is the last row's `(updatedAt, id)` when a FULL page came back (more may
 *  remain below it), else `null` — the bank is exhausted, which is what the library pane's "Load more"
 *  disappears on. The `ListCharactersResult` / `ListInboxResult` page shape, so the client's paged-collection
 *  machine consumes all three identically. */
export interface ListDocumentsResult {
  readonly items: readonly DocumentView[];
  readonly nextCursor: DocumentListCursor | null;
  /** How many documents match the SAME lens this page is a window into — a real `COUNT`, never `items.length`.
   *  It is what retired the surfaces' `100+` reading: the band header and the home tile used to print a full
   *  first PAGE as the bank's size-floor because a page was the only number they had (side-eye 2026-08-08
   *  P2-d). A census is a different question from "how many rows this page happened to carry", and both
   *  surfaces print the census. */
  readonly totalCount: number;
}

export interface ReindexResult {
  readonly workloadId: WorkloadId;
}
export const reindexResultSchema = z.strictObject({ workloadId: typeIdSchema(ID_PREFIX.workload) }) satisfies z.ZodType<ReindexResult>;

export const bankHealthViewSchema = z.strictObject({
  total: z.number(),
  passages: z.number(),
  chunks: z.number(),
  byPhase: z.record(z.enum(INGEST_PHASES), z.number()),
  staleExtraction: z.number(),
}) satisfies z.ZodType<BankHealthView>;

export const documentDetailViewSchema = documentViewSchema
  .strict()
  .extend({
    extractedText: z.string().optional(),
  })
  .transform(
    ({ extractedText, ...view }): DocumentDetailView => ({ ...view, ...(extractedText === undefined ? {} : { extractedText }) }),
  ) satisfies z.ZodType<DocumentDetailView>;

export const documentCharacterRefSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.character),
  name: z.string(),
}) satisfies z.ZodType<DocumentCharacterRef>;

export const documentAttachmentsViewSchema = z.strictObject({
  global: z.boolean(),
  chats: z.array(visibleRoomRefSchema).readonly(),
  characters: z.array(documentCharacterRefSchema).readonly(),
}) satisfies z.ZodType<DocumentAttachmentsView>;

export const activeChatDocumentViewSchema = documentViewSchema.strict().extend({
  hidden: z.boolean(),
  sources: z.array(z.enum(DOCUMENT_SCOPE_SOURCES)).readonly(),
}) satisfies z.ZodType<ActiveChatDocumentView>;

export const uploadResultSchema = z
  .strictObject({
    document: documentViewSchema.strict(),
    outcome: z.literal(["created", "duplicate"]),
    ingest: z.enum(INGEST_OUTCOMES),
    warning: z.literal("empty-extraction").optional(),
  })
  .transform(({ warning, ...result }): UploadResult => ({ ...result, ...(warning === undefined ? {} : { warning }) })) satisfies z.ZodType<UploadResult>;

export const listDocumentsResultSchema = z.strictObject({
  items: z.array(documentViewSchema.strict()).readonly(),
  nextCursor: documentListCursorSchema.strict().nullable(),
  totalCount: z.number(),
}) satisfies z.ZodType<ListDocumentsResult>;

export const ingestRunResultSchema = z.strictObject({
  documents: z.number(),
  chunksUpserted: z.number(),
  chunksNoop: z.number(),
  chunksPruned: z.number(),
  reExtracted: z.number(),
  failed: z.array(z.strictObject({ documentId: documentIdSchema, error: z.string() })).readonly(),
}) satisfies z.ZodType<IngestRunResult>;
