// domain/databank/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// `principal` (spine §7.1); ownership scopes off `principal.userId` (the fetchOwned idiom) — never a `users`
// read. The chat-attach authority is the injected `ensureChatHost` op (D18 — databank never reads the chat
// roster itself). The `reindex` scope/mode axis derives from `@orb/contracts/databank` (one home).

import type { DocOrigin, DocumentListCursor, IngestPhase, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";

interface DatabankActorParams {
  readonly principal: Principal;
}

// ── canon producers ───────────────────────────────────────────────────────────────────────────────────
export interface UploadDocumentParams extends DatabankActorParams {
  /** The raw source bytes (the multipart route hands the domain the file body). */
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly name: string;
}

export interface CreateFromTextParams extends DatabankActorParams {
  readonly name: string;
  /** origin 'text' (ST Notepad) — no bytes, no extraction; `extractedText` IS the canon. */
  readonly text: string;
}

/** scrapeWeb (DB7) — fetch a web page over the compose-bound ANY_HOST safeFetch guard, extract its html, then
 *  the SAME §2 canon pipeline as upload. `url` is validated `z.url()` at the tRPC seam; the domain trusts it. */
export interface ScrapeWebParams extends DatabankActorParams {
  readonly url: string;
}

/** scrapeYoutube (DB8) — fetch a video's caption track over the SAME safeFetch guard, join it to plain text,
 *  then the §2 canon pipeline. `url` is a watch URL (or bare id); `lang` selects the caption language (the tRPC
 *  seam defaults it to `en`). origin 'youtube', mime 'text/plain'. */
export interface ScrapeYoutubeParams extends DatabankActorParams {
  readonly url: string;
  readonly lang: string;
}

/** scrapeWiki (DB8) — fetch a MediaWiki article's plain-text extract over the SAME guard (the API endpoint is
 *  derived from the article URL's host), then the §2 canon pipeline. origin 'wiki', mime 'text/plain'. */
export interface ScrapeWikiParams extends DatabankActorParams {
  readonly url: string;
}

/** How a scraper names its document. `youtube`/`wiki` know the name from the API response (a `literal` string);
 *  `web` derives it from the extracted `<title>` — known only AFTER extraction — so it hands a `titleFallback`
 *  and the shared tail resolves `title ?? fallback`. Either way the name is capped + never empty. */
export type ScrapeName = { readonly literal: string } | { readonly titleFallback: string };

/** The write inputs a scraper hands the shared §2 canon tail (`substrate/scrape-canon`): who, the fetched bytes,
 *  and the canon stamps that vary by source (origin/mime/name/sourceUrl/auditAction). Not a wire boundary (a
 *  domain-internal handoff, no zod) — the three scraper verbs build it, one substrate fn consumes it. */
export interface ScrapeWrite extends DatabankActorParams {
  readonly bytes: Uint8Array;
  readonly origin: DocOrigin;
  /** The document's TRUE mime — the extraction contract. `ingest/index.ts` re-extracts with `doc.mime`, so
   *  this is what picks the loader, now and for every future extractor version. */
  readonly mime: string;
  /** The mime the raw bytes are STORED under, when it must differ from {@link mime}. The asset mime is a
   *  SERVING concern; #709 refuses an active document/script type as a stored asset (stored-XSS), so a
   *  scraper whose canon mime is one of those declares a neutral, magic-verifiable storage mime here.
   *  Defaults to {@link mime}. Nothing is lost: the bytes are byte-identical and re-extraction reads the
   *  document row, not the asset. */
  readonly storeMime?: string;
  readonly name: ScrapeName;
  readonly sourceUrl: string;
  readonly auditAction: string;
}

// ── documents CRUD (fetchOwned) ───────────────────────────────────────────────────────────────────────
export interface GetDocumentParams extends DatabankActorParams {
  readonly id: DocumentId;
  /** DocumentDetailView.extractedText only when asked (list/detail default omits the multi-MB canon). */
  readonly includeText?: boolean;
}

/** The library list's read, with EVERY lens the pane offers resolved SERVER-SIDE (owner ruling 2026-08-13,
 *  the `character.list` precedent): a keyset page can only ever search/filter what it has fetched, so a
 *  client-side predicate over the loaded window is a claim the surface has no standing to make. The pane used
 *  to filter a ≤150-row sliding window by name and by ingest phase, so a term (or a health chip) that matched
 *  nothing on the loaded pages read as "no matches" over a bank of hundreds. */
export interface ListDocumentsParams extends DatabankActorParams {
  readonly origin?: DocOrigin;
  readonly limit?: number;
  /** The previous page's `nextCursor` (the boundary row's `(updatedAt, id)`) — absent = the first page.
   *  KEYSET, never an offset: the list's head moves whenever an ingest bumps a row's `updatedAt`, and an
   *  offset would re-serve or skip rows underneath that (the `character.list` cursor precedent). */
  readonly cursor?: DocumentListCursor;
  /** SERVER-SIDE search over the WHOLE bank: the document NAME — the one string the row itself renders that
   *  a user can type (the subtitle is derived labels: provenance · size · passages). Blank/whitespace is the
   *  unsearched bank. NOT a second retrieval axis beside `search.documents`, which searches CHUNK CONTENT
   *  semantically for a chat turn; this is the library's own name filter. */
  readonly search?: string;
  /** The ingest-phase scope home's health chips (P2-a) — omitted = every phase. Resolving it costs one extra
   *  cross-domain read (see `DatabankContext.listChunkedDocumentIds`), so it is paid only when a chip is on. */
  readonly phase?: IngestPhase;
}

/** The list's LENS axes as SQL predicates over the same scope the page windows and the census counts (the
 *  `CharacterListFilter` precedent). Homed HERE per no-inline-types §7.4, built by the verb — which normalizes
 *  the request into this shape ONCE and hands the SAME object to both the page read and the count, so the two
 *  can never disagree about what they are a window into / a count of. */
export interface DocumentListFilter {
  /** Already trimmed + lowercased by the verb; `undefined` = the unsearched bank. */
  readonly search?: string | undefined;
  readonly origin?: DocOrigin | undefined;
  readonly phase?: DocumentPhaseScope | undefined;
}

/** The phase lens, RESOLVED — the phase asked for plus the two facts the `documents` table cannot answer
 *  alone: which documents embeddings reports as CHUNKED (databank never reads the vector table — D20 /
 *  Knowledge-Cluster inv 1-2, so the fact arrives through an injected op), and the clock the stall threshold
 *  is measured against (injected, never an ambient read). */
export interface DocumentPhaseScope {
  readonly phase: IngestPhase;
  /** The owner's documents carrying ≥1 chunk in the ACTIVE embed space. */
  readonly chunkedIds: readonly DocumentId[];
  readonly nowMs: number;
}

/** The bank-health CENSUS read (D-7's home tile) — principal-only: the whole bank is the scope. */
export interface BankHealthParams extends DatabankActorParams {}

export interface RenameDocumentParams extends DatabankActorParams {
  readonly id: DocumentId;
  readonly name: string;
}

export interface RemoveDocumentParams extends DatabankActorParams {
  readonly id: DocumentId;
}

// ── derived-layer maintenance ─────────────────────────────────────────────────────────────────────────
export interface ReindexParams extends DatabankActorParams {
  readonly scope: ReindexScope;
  readonly mode?: ReindexMode;
}

// ── scope junctions ───────────────────────────────────────────────────────────────────────────────────
export interface GlobalAttachParams extends DatabankActorParams {
  readonly documentId: DocumentId;
}

/** The global-attachment READ (D-1) — principal-only, like `worldInfo.listGlobal`'s twin. */
export interface ListGlobalParams extends DatabankActorParams {}

export interface ChatAttachParams extends DatabankActorParams {
  readonly documentId: DocumentId;
  readonly chatId: ChatId;
}

/** Character-scope attach (DB8). BOTH sides are the caller's own — the character gate is plain ownership
 *  (`ensureCharacterOwned`, the world-info precedent), NOT the D18 host authority (a character is an owned
 *  entity, not a membership room). */
export interface CharacterAttachParams extends DatabankActorParams {
  readonly documentId: DocumentId;
  readonly characterId: CharacterId;
}

export interface ListActiveForChatParams extends DatabankActorParams {
  readonly chatId: ChatId;
}

// ── the chat GATHER op (DB6, databank-design/07 §2) ───────────────────────────────────────────────────
/** The `{{databank}}` slot's retrieval request, built by chat's GATHER and passed through the compose-injected
 *  op. No `principal`: the turn is already membership-authorized upstream, and scope resolves by CHAT inside
 *  `search.documents` (host-only v1). `queryText` is chat-built (pending + last-2 turns); `tokenBudget` is the
 *  slot's share of chat's ONE budget pass — databank fits WHOLE chunks inside it. A plain type (not a zod
 *  schema): a compose-injected internal op crosses no untrusted boundary, matching `ExtractTextOp`/
 *  `EnqueueIngestOp`. */
export interface DatabankGatherParams {
  readonly chatId: ChatId;
  /** The room host — the owner of the document space `search.documents` scans (host-only v1). */
  readonly hostUserId: UserId;
  readonly queryText: string;
  readonly tokenBudget: number;
  /** The retrieval params (the host's `UserSettings.databank.retrieval`, threaded via ForeignInputs) the
   *  gather passes to `search.documents`. Absent ⇒ gather omits them and search uses its own defaults, which
   *  ARE the databank defaults (the byte-identity pin: an old caller not supplying these is unchanged). */
  readonly k?: number | undefined;
  readonly minScore?: number | undefined;
  readonly rerank?: boolean | undefined;
}
