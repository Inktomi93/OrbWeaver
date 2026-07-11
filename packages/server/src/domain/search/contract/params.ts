// domain/search/contract/params — every verb's *Params. The card-space surface (`knn`
// /`findCharacters`) + the chat-memory surface (`digests`/`segments`/`corpus`, PD-35).
//
// SCOPING: the card verbs are OWNER-scoped over `character_embeddings` via `characters.ownerId` (D20: the
// vector substrate carries no `ownerId`; scope DERIVES from the producer). `ownerId` is the resolved
// `Principal.userId`, handed in by the caller — search NEVER reads the `users` table.
//
// CHAT-MEMORY SCOPING (PD-35): the `digests`/`segments` lenses consume `MemoryQueryOptions`
// (@orb/contracts/search — the cross-domain wire `memory.recall` threads into `search`): scope is the ONE
// authorized chat (`scope.chat`), no membership derivation at all (knowledge-cluster §6 within-chat —
// the caller already holds the chat). `DigestsParams`/`SegmentsParams` are pure ALIASES of
// `MemoryQueryOptions` (dedicated `*Params` shapes would add nothing over the canonical contract type — they
// are kept only so the `SearchService` signatures read self-documenting; FLAG[PD-35]). `CorpusParams` is a
// DISTINCT shape (owner-wide cross-chat, owner-DERIVED — NOT expressible from a single-chat
// `MemoryQueryOptions`), defined below.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, UserId } from "@orb/kit/ids";

/** The generic within-space top-k vector scan over the card embedding space: embed the query → scan
 *  `character_embeddings` (filtered to the active embed model's space) → CSLS hub-adjust → optional
 *  cross-encoder rerank. Returns raw `SearchHit`s (no display enrichment). */
export interface KnnParams {
  /** The resolved `Principal.userId` — the owner whose characters are in scope (scoped at the SQL WHERE,
   *  never post-filtered; search never reads `users`). */
  readonly ownerId: UserId;
  /** The natural-language query text — embedded into the query vector (inputType `"query"`). */
  readonly query: string;
  /** How many hits to return after ranking (and rerank, if enabled). */
  readonly topN: number;
  /** Opt-in cross-encoder rerank over the CSLS-ranked pool. Default off (pure CSLS order). When the
   *  resolved `rerank` role is hosted-only (PD-11), enabling this PROPAGATES the not-supported throw —
   *  search owns no silent CSLS fallback. */
  readonly rerank?: boolean | undefined;
}

/** Character-card vector search with distilled-facet enrichment — the primitive `discovery` (W3) consumes
 *  for similarity browsing / archetype grouping. Same pipeline as {@link KnnParams} plus a
 *  `character_summaries` + avatar JOIN; returns `CharacterCardHit`s. */
export interface FindCharactersParams {
  readonly ownerId: UserId;
  readonly query: string;
  readonly topN: number;
  readonly rerank?: boolean | undefined;
}

/** Within-chat digest retrieval (knowledge-cluster §6 within-chat; the ONLY op `memory.recall` calls). A
 *  pure alias of the cross-domain {@link MemoryQueryOptions}: scope is `scope.chat` (one authorized chat),
 *  with `queryText` (embedded → cosine scan), the egocentric `scopedCharacterId`, the tiered-bridge
 *  `candidates` restriction, `mode` (mixC ⇒ rerank), and `minScore`/`keywordMatch`. */
export type DigestsParams = MemoryQueryOptions;

/** Within-chat verbatim-segment retrieval — the same {@link MemoryQueryOptions} shape over the verbatim
 *  lens. REQUIRES `scopedCharacterId` (the verbatim lens has no character column; the egocentric POV stamps
 *  the result `BlockKey` — else a typed `SearchError(SCOPE_REQUIRED)`). */
export type SegmentsParams = MemoryQueryOptions;

/** Cross-chat hybrid corpus retrieval (knowledge-cluster §6 cross-chat — "where across all my chats did X
 *  happen"): joint digest+segment scan → CSLS → joint rerank → block dedupe → content-hash collapse. NOT a
 *  `MemoryQueryOptions` (that carries a single `scope.chat`): the owner-wide scope is owner-DERIVED via the
 *  producer card (`characters.ownerId` — D20; NO `chat_participants` read, membership is materialized at
 *  build by the witnessing horizons). `ownerId` is the resolved caller, handed in like `knn`'s. */
export interface CorpusParams {
  /** The resolved owner — the cross-chat scope derives via the producer card (`characters.ownerId`). */
  readonly ownerId: UserId;
  /** The natural-language query text — embedded into the query vector (`inputType: "query"`). */
  readonly queryText: string;
  /** mixC ⇒ joint cross-encoder rerank over both lenses; otherwise CSLS order (dedupe/collapse always run). */
  readonly mode: MemoryQueryOptions["mode"];
  /** Raw-cosine inclusion floor (similarity = `1 − distance`). */
  readonly minScore: number;
}

/** Cross-modal text→image search over the owner's `image_embeddings` (PD-36). The query TEXT is embedded
 *  INTO the shared multimodal image space (`imageEmbed({ kind: "text" })`) and scanned against ONE lens;
 *  owner-scope DERIVES via the owned producer asset (`assets.ownerId` — D20/D21). Ranking is RAW cosine
 *  distance: the `image_embeddings.hub_score` (an image↔image signal) is DELIBERATELY not CSLS-applied on
 *  this cross-modal path (the cosine-scale-mismatch invariant — see `verbs/images.ts`). */
export interface ImagesParams {
  /** The resolved owner — the scope derives via the owned asset (`assets.ownerId`). */
  readonly ownerId: UserId;
  /** The natural-language query text — embedded into the IMAGE space (text side of the multimodal model). */
  readonly query: string;
  /** How many hits to return after ranking (and rerank, if enabled). */
  readonly topN: number;
  /** The lens to scan: `image-captioned` (joint vision+text) or `image-raw` (pure visual). Both coexist
   *  per `(assetId, model, lens)`; a query scans ONE lens (D34 lens axis, `@orb/contracts/embeddings`). */
  readonly lens: ImageLens;
  /** Opt-in cross-encoder rerank over the caption pool (the `image-captioned` lens' text). A raw-lens hit
   *  (no caption) is unscorable → recall-preserving passthrough. A rerank rejection PROPAGATES (PD-11 — no
   *  silent fallback). */
  readonly rerank?: boolean | undefined;
}

/** Character discovery by best-segment neighbourhood (PD-35) — the THIRD retrieval lens: embed the query →
 *  owner-wide cosine scan of the VERBATIM `chat_segments` (lived-scene space, over the owner's materialized
 *  chat set) → CSLS → optional rerank BEFORE grouping → credit each segment to its character(s) via the
 *  tier-0 digest (`resolveSegmentDisplay`) → group by character (evidence-carrying). Answers "who has LIVED
 *  scenes like X — with the scenes as evidence", distinct from `findCharacters` ("whose CARD reads like X"). */
export interface DiscoverParams {
  /** The resolved owner — the cross-chat scope derives via the producer card (`characters.ownerId`; the
   *  verbatim lens has no owner column, so its chat set is the owner's materialized digest chats). */
  readonly ownerId: UserId;
  /** The natural-language query text — embedded into the query vector (`inputType: "query"`). */
  readonly queryText: string;
  /** How many CHARACTERS to return after grouping (the segment pool over-fetches this — see constants). */
  readonly topN: number;
  /** Opt-in cross-encoder rerank over the SEGMENT pool, applied BEFORE grouping (a reranker-promoted segment
   *  can pull in a character the CSLS order buried). A rerank rejection PROPAGATES (PD-11 — no fallback). */
  readonly rerank?: boolean | undefined;
}

/** "More like this character" (PD-35 sibling) — seed-vector top-k over the CARD space. Seeds from the stored
 *  card embedding of `characterId` (NOT a re-embed of the card text — no query/document space cross), scans
 *  the same space, excludes the seed, CSLS-ranks, and enriches like `findCharacters` (returns
 *  `CharacterCardHit`s). The seed read is OWNER-BELTED (`characters.ownerId`): a foreign/unknown seed yields
 *  an empty result — never another tenant's neighbourhood (the neo V2-2 cross-tenant-seed lesson). */
export interface SimilarCharactersParams {
  /** The resolved owner — belts BOTH the seed read and the scan (`characters.ownerId`, D20). */
  readonly ownerId: UserId;
  /** The seed character whose stored card vector drives the scan; excluded from its own results. */
  readonly characterId: CharacterId;
  /** How many neighbours to return after ranking. */
  readonly topN: number;
}

/** "More like this avatar" (PD-35 sibling) — seed-vector top-k over the IMAGE space (image↔image, SAME
 *  space, so CSLS APPLIES — unlike the cross-modal `images` verb). Seeds from the stored avatar embedding of
 *  `characterId` at one `lens`, scans other owned avatars, excludes the seed, CSLS-ranks, and returns the
 *  visually-nearest characters. The seed read is OWNER-BELTED on both `characters.ownerId` and
 *  `assets.ownerId` (the neo V2-2 cross-tenant-seed lesson): a foreign/unknown seed yields an empty result. */
export interface SimilarArtParams {
  /** The resolved owner — belts the seed read + the scan (`characters.ownerId` ∩ `assets.ownerId`). */
  readonly ownerId: UserId;
  /** The seed character whose current avatar's stored image vector drives the scan; excluded from results. */
  readonly characterId: CharacterId;
  /** How many visually-nearest characters to return after ranking. */
  readonly topN: number;
  /** The avatar lens to compare in (both seed + scan). Defaults to `image-raw` — the pure-visual portrait
   *  lens (`image↔image` similarity; `@orb/contracts/embeddings`). */
  readonly lens?: ImageLens | undefined;
}

/** Lexical BM25 card search (PD-37) — the complementary retrieval surface to the vector verbs, over an
 *  in-memory MiniSearch index of the owner's card text fields (`name`/`description`/`personality`/
 *  `scenario`/`creatorNotes`), fuzzy + prefix + per-field boosts. Owner-scoped over `characters.ownerId`
 *  (D20); the per-owner index is TTL-cached (`substrate/field-index.ts`). */
export interface FieldSearchParams {
  /** The resolved owner — the index corpus is this owner's cards (`characters.ownerId`). */
  readonly ownerId: UserId;
  /** The lexical query text. */
  readonly query: string;
  /** How many hits to return (top-N by BM25 score). */
  readonly topN: number;
}

/** Autocomplete suggestions over the same per-owner card index (PD-37 `suggest`) — completes a partial
 *  query into whole-term suggestions ranked by aggregate BM25 score. */
export interface SuggestParams {
  readonly ownerId: UserId;
  /** The partial query text to complete. */
  readonly query: string;
  /** How many suggestions to return. */
  readonly limit: number;
}
