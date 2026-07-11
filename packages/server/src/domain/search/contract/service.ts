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
// — allowed BY DESIGN: search is the bulk reader over the whole store and reads the tables via @orb/db; it
// does NOT call embeddings verbs). It does NOT inject an `embeddings.query` op. The vector_distance_cos
// SQL lives in `persistence/nearest.ts` and is search's alone (invariant #1: no domain outside search
// issues that query). No `domain/embeddings` file is touched or imported.
//
// ── DEFERRAL LEDGER ─────────────────────────────────────────────────────────────────────────────────────
// PD-35 (BUILT 2026-07-10): `discover` + the similarity trio — the THIRD retrieval lens and its two seed-vector
//   siblings, all SEARCH verbs (D55: "membership-gated retrieval are search verbs"; neo homes `discover` in
//   `search/verbs/core.ts` — NOT discovery-domain; the prior "DISCOVERY-domain" label here was doc defect F1/F2,
//   corrected per `reports/stickler/discovery-search-untangle.md`):
//     • `discover` — text query → owner-wide verbatim `chat_segments` scan → CSLS → rerank-before-group →
//       segment→character credit (`resolveSegmentDisplay`, co-star aware) → group by character. Query-only
//       (no seed id); `DiscoverParams`/`DiscoverCharacter`/`DiscoverSegment` + the `DISCOVER_*` constants.
//     • `similarCharacters` — seed-vector top-k over the CARD space (stored seed vector, owner-belted, CSLS).
//     • `similarArt` — seed-vector top-k over the IMAGE space (avatar↔avatar, CSLS APPLIES — same-space).
//   Note: `digests`/`segments`/`corpus` are BUILT (the chat-memory retrieval the `recall` path depends on
//   — `persistence/{scope,digest-rows}.ts` + `substrate/dedupe.ts`).
//   Open sub-flags inside the built verbs: `recencyBias`/`verbatimWindow` are accepted-but-not-applied on
//   `digests` (verbatimWindow shapes memory's pre-call query; recencyBias needs a formula); `corpus` drops a
//   segment-only block (no matching digest ⇒ unkeyable). See each verb header.
// PD-36 (BUILT): the cross-modal `images` verb — text→image over `image_embeddings`, RAW-distance rank
//   (the CSLS-skip invariant), lens-gated, caption rerank. See `verbs/images.ts`.
// PD-37 (BUILT): the lexical BM25 `fields`/`suggest` engine — a per-owner MiniSearch index over card text
//   fields, TTL+LRU cached (`substrate/field-index.ts`), fed by `persistence/cards.ts`. The `minisearch`
//   dep is sealed to `field-index.ts` (the `search-minisearch-seal` dep-cruiser rule). A SECOND retrieval
//   surface on this domain (vector is the first); callers pick the surface by verb, never a backend.
// FLAG[PD-38]: the unified `search(UnifiedSearchParams)` dispatch + `SearchScope` axis → when the
//   full verb set exists (the 7-branch result union + exhaustive `assertNever` dispatch is premature with
//   a partial surface).

import type { RoleClients } from "@orb/contracts/role-clients";
import type { ReadOnlyDb } from "@orb/db";
import type {
  CorpusParams,
  DigestsParams,
  DiscoverParams,
  FieldSearchParams,
  FindCharactersParams,
  ImagesParams,
  KnnParams,
  SegmentsParams,
  SimilarArtParams,
  SimilarCharactersParams,
  SuggestParams,
} from "./params";
import type {
  CharacterCardHit,
  CorpusHit,
  DigestSearchHit,
  DiscoverCharacter,
  FieldSearchHit,
  ImageSearchHit,
  SearchHit,
  SearchSuggestion,
  SegmentSearchHit,
  SimilarArtHit,
} from "./results";

/**
 * The DI bundle the search verbs close over (wired at the entry composition root; surfaced through
 * `context.ts`). `db` routes the vector + display reads through `persistence/`; `roleClients` is the
 * required bound-callable inference bundle (embed + rerank + the embed-model space tag). search
 * sideways-imports no sibling runtime (domain-no-cross-feature) and is READ-ONLY (invariant #3 —
 * `db`'s `ReadOnlyDb` type (`@orb/db`) carries only `select`/`query`; a write call is a `tsc` error,
 * not merely a behavioral convention — PD-102).
 */
export interface SearchContext {
  readonly db: ReadOnlyDb;
  readonly roleClients: RoleClients;
  /** The injected wall-clock (`no-raw-clock`: the domain never calls `Date.now()`). Consumed ONLY by the
   *  lexical `fields`/`suggest` engine's per-owner BM25 index cache (TTL freshness — `substrate/field-index.ts`);
   *  the vector verbs are time-free. */
  readonly now: () => number;
}

/** What `createSearchService` receives from the entry root. Identical to {@link SearchContext} — no
 *  deps→context transform; the name is kept for front-door surface symmetry with the other domains. */
export type SearchServiceDeps = SearchContext;

/**
 * The search surface — the one parameterized retrieval engine (knowledge-cluster invariant #4).
 * `knn` (the generic within-space card scan → raw hits) + `findCharacters` (the same pipeline + distilled-facet
 * enrichment) + the chat-memory lenses (`digests`/`segments`/`corpus`) + cross-modal `images` + lexical
 * `fields`/`suggest` + the PD-35 discovery lens (`discover`) and its seed-vector siblings
 * (`similarCharacters`/`similarArt`). Only the unified `search()` dispatch (PD-38) remains deferred.
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
  /** Cross-modal text→image retrieval (PD-36; owner-scoped over `image_embeddings`, ONE lens). RANKS ON RAW
   *  COSINE DISTANCE — the image↔image `hub_score` is deliberately NOT applied on this cross-modal path
   *  (`verbs/images.ts` CSLS-skip invariant). */
  readonly images: (params: ImagesParams) => Promise<ImageSearchHit[]>;
  /** Lexical BM25 card search (PD-37) — the complementary (non-vector) retrieval surface over the owner's
   *  per-owner MiniSearch index (`substrate/field-index.ts`). `score` is a BM25 score (HIGHER = better). */
  readonly fields: (params: FieldSearchParams) => Promise<FieldSearchHit[]>;
  /** Autocomplete over the same per-owner card index (PD-37) — completes a partial query into suggestions. */
  readonly suggest: (params: SuggestParams) => Promise<SearchSuggestion[]>;
  /** Character discovery by best-segment neighbourhood (PD-35) — the THIRD retrieval lens: text query →
   *  owner-wide verbatim `chat_segments` scan → CSLS → rerank-before-group → segment→character credit
   *  (co-star aware) → grouped, evidence-carrying `DiscoverCharacter`s. */
  readonly discover: (params: DiscoverParams) => Promise<DiscoverCharacter[]>;
  /** "More like this character" (PD-35) — seed-vector top-k over the CARD space (stored seed vector,
   *  owner-belted, CSLS). Same enrichment as `findCharacters` ⇒ returns `CharacterCardHit`s. */
  readonly similarCharacters: (params: SimilarCharactersParams) => Promise<CharacterCardHit[]>;
  /** "More like this avatar" (PD-35) — seed-vector top-k over the IMAGE space (avatar↔avatar; CSLS APPLIES,
   *  same-space, unlike the cross-modal `images` verb). Returns the visually-nearest characters. */
  readonly similarArt: (params: SimilarArtParams) => Promise<SimilarArtHit[]>;
}
