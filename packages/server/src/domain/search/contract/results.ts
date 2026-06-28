// domain/search/contract/results — every verb's *Result (search.md §"Verbs"). The W2 CORE hit types.
//
// `score` is ALWAYS the CSLS-adjusted retrieval score (`distance − 1 + hubScore`; LOWER = closer — see
// `substrate/csls.ts`). When rerank is enabled the result ORDER reflects the cross-encoder, but `score`
// stays the CSLS retrieval signal — the two are different units (rerank scores are higher-is-better,
// family-dependent) and mixing them in one field would be a lie. Consumers read ORDER for relevance and
// `score` for the stable similarity signal.
//
// The 5 other branches of the full surface (`ImageSearchHit`, `DiscoverCharacter`, `DiscoverSegment`,
// `DigestSearchHit`, `SegmentSearchHit`, `CorpusHit`, and the 7-branch `UnifiedSearchResult` union) are
// DEFERRED with their verbs (see `service.ts`). They are added here when those verbs land.

import type { CharacterId } from "@orb/kit/ids";

/** One raw vector hit from `knn` — the entity id + its CSLS retrieval score. In the W2 card space the
 *  entity is a character (the scanned table is `character_embeddings`). */
export interface SearchHit {
  readonly characterId: CharacterId;
  /** The CSLS-adjusted retrieval score (`distance − 1 + hubScore`); LOWER = closer. */
  readonly score: number;
}

/** A `findCharacters` hit — a {@link SearchHit} enriched with the distilled card facets `discovery`
 *  surfaces (read off `character_summaries` — D28: the flat-row distillation, no version join) plus the
 *  avatar CAS key. Facet fields are `null` when the character has no computed summary yet. */
export interface CharacterCardHit {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  /** The avatar asset's CAS hash (the client fetches bytes by hash); `null` when the card has no avatar. */
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}
