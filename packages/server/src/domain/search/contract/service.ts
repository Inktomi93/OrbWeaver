// domain/search/contract/service — the typed API surface (read THIS to know everything the domain does).
// Holds:
//   • SearchContext       the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • SearchServiceDeps   what the entry root supplies (identical to the context — no transform)
//   • SearchService       the authoritative verb interface (the front door re-exports the type)
//
// ── THE INJECTION MODEL (boundaries-are-physics) ───────────────────────────────────────────────────────
// search is the ONE vector-retrieval engine (knowledge-cluster invariant #4). Its only cross-tier seam is
// the `rolesClients` bundle (`@orb/contracts/role-clients`) — the GOLD-STANDARD composition seam the entry
// root mints ONCE at boot and threads in. search calls:
//   - `roleClients.embed(query, { inputType: "query" })` → the query vector (within-space scan key).
//   - `roleClients.rerank(query, documents)`             → the optional cross-encoder reorder.
//   - `roleClients.embedModel`                            → the active embed model = the space tag; the
//     scan filters `character_embeddings.model = embedModel` so a query NEVER compares across spaces
//     (providers.md §2b/§11 embedding-space invariant; the rerank pairs with the same embed space).
// `roleClients` is a REQUIRED dep: `createSearchService(ctx)` is typed so a
// missing wire is a `tsc` error, not a silent `createDefaultRoleClients` fallback (that drawer is DELETED
// in orbweaver — the entry root fills the bundle via `connection.resolveRole(role)` per role, Esoteric §2).
//
// ── BOUNDARY DEVIATION (flagged) ───────────────────────────────────────────────────────────────────────
// search reads the vector tables DIRECTLY from `@orb/db/schema/embeddings` (a downward dep into the schema
// — allowed; embeddings.md §"Cross-feature composition": "search reads the tables directly via @orb/db; it
// does NOT call embeddings verbs"). It does NOT inject an `embeddings.query` op. The vector_distance_cos
// SQL lives in `persistence/nearest.ts` and is search's alone (invariant #1: no domain outside search
// issues that query). This is the AUTHORITATIVE-DOC boundary; the task prompt's "inject embeddings.query
// type-only" was the older framing — the doc wins (CLAUDE.md: when a prompt conflicts with the spine, the
// doc wins). No concurrent `domain/embeddings` file is touched or imported.
//
// ── DEFERRAL LEDGER ─────────────────────────────────────────────────────────────────────────────────────
// FLAG[PD-35]: `discover` verb (the DISCOVERY-domain character-discovery consumer, NOT memory —
//   PD-39/40 territory) and its `DiscoverParams`/`DiscoverCharacter`/`DiscoverSegment` types.
//   Note: `digests`/`segments`/`corpus` are BUILT (the chat-memory retrieval the `recall` path depends on
//   — `persistence/{scope,digest-rows}.ts` + `substrate/dedupe.ts`).
//   Open sub-flags inside the built verbs: `recencyBias`/`verbatimWindow` are accepted-but-not-applied on
//   `digests` (verbatimWindow shapes memory's pre-call query; recencyBias needs a formula); `corpus` drops a
//   segment-only block (no matching digest ⇒ unkeyable). See each verb header.
// FLAG[PD-36]: the cross-modal `images` verb → a later wave when the `imageEmbed` text→image path +
//   the cross-modal-CSLS-skip exception are wired (proposed/search-deferred-verbs.md §PD-36).
// FLAG[PD-37]: the lexical BM25 `fields`/`suggest` engine → a later wave (needs the `minisearch`
//   dependency, not in the workspace — a separate engine, not vector retrieval).
// FLAG[PD-38]: the unified `search(UnifiedSearchParams)` dispatch + `SearchScope` axis → when the
//   full verb set exists (the 7-branch result union + exhaustive `assertNever` dispatch is premature with
//   a partial surface).

import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type {
  CorpusParams,
  DigestsParams,
  FindCharactersParams,
  KnnParams,
  SegmentsParams,
} from "./params";
import type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  SearchHit,
  SegmentSearchHit,
} from "./results";

/**
 * The DI bundle the search verbs close over (wired at the entry composition root; surfaced through
 * `context.ts`). `db` routes the vector + display reads through `persistence/`; `roleClients` is the
 * required bound-callable inference bundle (embed + rerank + the embed-model space tag). search
 * sideways-imports no sibling runtime (domain-no-cross-feature) and is READ-ONLY (invariant #3 — the
 * bundle carries no write path to any vector table).
 */
export interface SearchContext {
  readonly db: Db;
  readonly roleClients: RoleClients;
}

/** What `createSearchService` receives from the entry root. Identical to {@link SearchContext} — no
 *  deps→context transform; the name is kept for front-door surface symmetry with the other domains. */
export type SearchServiceDeps = SearchContext;

/**
 * The search surface — the one parameterized retrieval engine (knowledge-cluster invariant #4).
 * W2 CORE: `knn` (the generic within-space card scan → raw hits) + `findCharacters` (the same pipeline + distilled-facet enrichment,
 * the primitive `discovery` consumes). The memory/discover/image/lexical verbs join as they land (see the
 * deferral ledger above).
 */
export interface SearchService {
  readonly knn: (params: KnnParams) => Promise<SearchHit[]>;
  readonly findCharacters: (params: FindCharactersParams) => Promise<CharacterCardHit[]>;
  /** Within-chat digest retrieval (the `memory.recall` mixB/mixC scan). Returns ranked hits, each carrying
   *  its `BlockKey` — the compose root maps `hits.map(h => h.blockKey)` into `ChatContext.searchDigests`. */
  readonly digests: (params: DigestsParams) => Promise<DigestSearchHit[]>;
  /** Within-chat verbatim-segment retrieval (the verbatim lens; requires an egocentric `scopedCharacterId`). */
  readonly segments: (params: SegmentsParams) => Promise<SegmentSearchHit[]>;
  /** Cross-chat hybrid corpus retrieval (owner-wide; joint digest+segment rerank + block/content collapse). */
  readonly corpus: (params: CorpusParams) => Promise<CorpusHit[]>;
}
