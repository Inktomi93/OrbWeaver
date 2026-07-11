// domain/search/contract/results — every verb's *Result. The W2 CORE hit types.
//
// `score` is ALWAYS the CSLS-adjusted retrieval score (`distance − 1 + hubScore`; LOWER = closer — see
// `substrate/csls.ts`). When rerank is enabled the result ORDER reflects the cross-encoder, but `score`
// stays the CSLS retrieval signal — the two are different units (rerank scores are higher-is-better,
// family-dependent) and mixing them in one field would be a lie. Consumers read ORDER for relevance and
// `score` for the stable similarity signal.
//
// The chat-memory hits (`DigestSearchHit`/`SegmentSearchHit`/`CorpusHit`) + the `discover` grouped result
// (`DiscoverCharacter`/`DiscoverSegment`) + the similarity hits (`SimilarArtHit`; `similarCharacters` reuses
// `CharacterCardHit`) are BUILT. The 7-branch `UnifiedSearchResult` union is DEFERRED (see `service.ts`).
//
// EVERY chat-memory hit carries a {@link BlockKey} (the `(chatId, tier, blockIdx, scopedCharacterId)` block
// identity) so the compose root maps hits → `BlockKey[]` for the `ChatContext.searchDigests`/`searchCorpus`
// ops (memory then resolves keys → its own digest rows), plus the rerankable/displayable `text`.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { BlockKey } from "@orb/contracts/search";
import type { AssetId, CharacterId, ChatId } from "@orb/kit/ids";

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

/** One lexical (BM25) card hit (PD-37) — the card id + its MiniSearch relevance score. `score` is the
 *  BM25 score (HIGHER = better; the lexical surface's own unit, distinct from the vector verbs' CSLS
 *  distance where LOWER = closer — the two are never mixed). */
export interface FieldSearchHit {
  readonly characterId: CharacterId;
  readonly score: number;
}

/** One autocomplete suggestion (PD-37 `suggest`) — the completed query string + its aggregate BM25 score. */
export interface SearchSuggestion {
  readonly suggestion: string;
  readonly score: number;
}

/** One evidence segment inside a {@link DiscoverCharacter} (PD-35) — a verbatim lived-scene block that
 *  matched the query. `score` is the CSLS-adjusted retrieval score (LOWER = closer; when rerank is enabled
 *  the character/segment ORDER reflects the cross-encoder but `score` stays the CSLS signal); `snippet` is
 *  the verbatim block text sliced to `SNIPPET_CHARS`. `(chatId, blockIdx)` locates the block in canon. */
export interface DiscoverSegment {
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly snippet: string;
  readonly score: number;
}

/** One discovered character (PD-35) — a {@link CharacterCardHit}'s display fields PLUS the evidence: the
 *  best-matching lived-scene segments (up to `DISCOVER_SEGMENTS_PER_CHAR`) and `matchCount` (every crediting
 *  segment, uncapped). `score` is the character's BEST segment score (grouping is in ranked order, so the
 *  first-seen segment is the best). A group-scene block credits EVERY co-star present in it (the
 *  `chat_digest_speakers` expansion), so one segment can be evidence for several characters. */
export interface DiscoverCharacter {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
  readonly matchCount: number;
  readonly segments: readonly DiscoverSegment[];
}

/** One "more like this avatar" hit (PD-35) — a character surfaced by IMAGE↔IMAGE avatar similarity. `score`
 *  is the CSLS-adjusted retrieval score (LOWER = closer; CSLS APPLIES here — same-space image↔image, unlike
 *  the cross-modal `images` verb which skips it). `lens` is the avatar lens compared (default `image-raw`);
 *  `avatarHash` is the CAS key of the matched character's avatar. */
export interface SimilarArtHit {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly lens: ImageLens;
}

/** One cross-modal text→image hit (PD-36) — the owned asset + its RAW cosine distance to the text query.
 *  Unlike the other hits, `score` is the raw cosine distance (LOWER = closer), NOT a CSLS-adjusted signal:
 *  the `image_embeddings.hub_score` is an image↔image scale that INVERTS a cross-modal ranking, so the verb
 *  deliberately omits it (see `verbs/images.ts`). When rerank is enabled the ORDER reflects the caption
 *  cross-encoder; `score` stays the raw cosine distance. `caption` is the `image-captioned` lens' text
 *  (`null` for `image-raw`). */
export interface ImageSearchHit {
  readonly assetId: AssetId;
  readonly score: number;
  readonly lens: ImageLens;
  readonly caption: string | null;
}
