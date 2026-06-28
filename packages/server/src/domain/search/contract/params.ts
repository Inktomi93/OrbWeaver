// domain/search/contract/params — every verb's *Params (search.md §"Verbs"). The W2 CORE surface: the
// within-space vector query (`knn`) + the discovery-consumed character-card primitive (`findCharacters`).
//
// SCOPING (W2): both verbs are OWNER-scoped over `character_embeddings` — the one vector table cleanly
// owner-scoped via `characters.ownerId` (D20: the vector substrate carries no `ownerId`; scope DERIVES
// from the producer). `ownerId` is the resolved `Principal.userId`, handed in by the caller (the entry/
// transport seam mints the Principal; search receives the already-scoped id — it NEVER reads the `users`
// table). The chat/segment/digest-scoped params (`DigestsParams`/`SegmentsParams`/`CorpusParams`, plus the
// `UnifiedSearchParams`/`SearchScope` dispatch axis and `ImageSearchParams`/`FieldSearchParams`) are
// DEFERRED — they require the membership-derived chat scope (D18: chats have no `ownerId`; "my chats" is
// pure `chat_participants` membership), which is the memory-retrieval machinery search.md homes in
// `persistence/scope.ts`. See `service.ts` header for the deferral ledger.

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
