// domain/search/contract/params — every verb's *Params (search.md §"Verbs"). The card-space surface (`knn`
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
// `MemoryQueryOptions` (the `*Params` names in search.md add nothing over the canonical contract type — they
// are kept only so the `SearchService` signatures read self-documenting; FLAG[PD-35]). `CorpusParams` is a
// DISTINCT shape (owner-wide cross-chat, owner-DERIVED — NOT expressible from a single-chat
// `MemoryQueryOptions`), defined below.

import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { UserId } from "@orb/kit/ids";

/** The generic within-space top-k vector scan over the card embedding space: embed the query → scan
 *  `character_embeddings` (filtered to the active embed model's space) → CSLS hub-adjust → optional
 *  cross-encoder rerank. Returns raw {@link import('./results').SearchHit}s (no display enrichment). */
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
 *  `character_summaries` + avatar JOIN; returns {@link import('./results').CharacterCardHit}s. */
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
