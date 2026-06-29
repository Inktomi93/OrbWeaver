// domain/search/contract/results — every verb's *Result (search.md §"Verbs"). The W2 CORE hit types.
//
// `score` is ALWAYS the CSLS-adjusted retrieval score (`distance − 1 + hubScore`; LOWER = closer — see
// `substrate/csls.ts`). When rerank is enabled the result ORDER reflects the cross-encoder, but `score`
// stays the CSLS retrieval signal — the two are different units (rerank scores are higher-is-better,
// family-dependent) and mixing them in one field would be a lie. Consumers read ORDER for relevance and
// `score` for the stable similarity signal.
//
// The chat-memory hits (`DigestSearchHit`/`SegmentSearchHit`/`CorpusHit`) land with PD-35 (below). The
// remaining branches (`ImageSearchHit`, `DiscoverCharacter`, `DiscoverSegment`, and the 7-branch
// `UnifiedSearchResult` union) are DEFERRED with their verbs (see `service.ts`).
//
// EVERY chat-memory hit carries a {@link BlockKey} (the `(chatId, tier, blockIdx, scopedCharacterId)` block
// identity) so the compose root maps hits → `BlockKey[]` for the `ChatContext.searchDigests`/`searchCorpus`
// ops (memory then resolves keys → its own digest rows), plus the rerankable/displayable `text`.

import type { BlockKey } from "@orb/contracts/search";
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

/** One within-chat digest hit (the distilled lens). `blockKey` is the block identity the compose root maps
 *  to a `BlockKey` for `searchDigests`; `score` is the CSLS-adjusted retrieval score (LOWER = closer; when
 *  `mode==="mixC"` the ORDER reflects the cross-encoder but `score` stays the CSLS signal); `text` is the
 *  stored digest body (the rerank document / `{{memory}}` content). */
export interface DigestSearchHit {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly text: string;
}

/** One within-chat verbatim-segment hit. Same shape as {@link DigestSearchHit}; `text` is the verbatim
 *  transcript. `blockKey.tier` is `0` (segments are tier-0 verbatim blocks) and `blockKey.scopedCharacterId`
 *  is the caller's egocentric POV (the segment lens carries no character column). */
export interface SegmentSearchHit {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly text: string;
}

/** One cross-chat corpus hit — a block that survived the joint digest+segment rerank, block-level dedupe,
 *  and content-hash collapse. `blockKey` is the surviving block's identity (a digest+segment of the same
 *  block collapse to one); `score` is the CSLS signal; `text` is the winning lens' body. */
export interface CorpusHit {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly text: string;
}
