// domain/search/contract/results — every verb's *Result. `score` is always the CSLS-adjusted retrieval
// score (distance − 1 + hubScore; LOWER = closer) except where noted — when rerank is enabled the result
// ORDER reflects the cross-encoder but `score` stays the CSLS signal (mixing the two units would be a lie).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { BlockKey } from "@orb/contracts/search";
import type { AssetId, CharacterId, ChatId } from "@orb/kit/ids";

export interface SearchHit {
  readonly characterId: CharacterId;
  readonly score: number;
}

/** A findCharacters hit — a {@link SearchHit} enriched with distilled card facets + the avatar CAS key. */
export interface CharacterCardHit {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}

export interface DigestSearchHit {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly text: string;
}

/** blockKey.tier is 0 (segments are tier-0 verbatim blocks); scopedCharacterId is the caller's egocentric POV. */
export interface SegmentSearchHit {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly text: string;
}

/** A block that survived the joint digest+segment rerank, block-level dedupe, and content-hash collapse. */
export interface CorpusHit {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly text: string;
}

/** score is the BM25 score (higher = better) — the lexical surface's own unit, never mixed with CSLS. */
export interface FieldSearchHit {
  readonly characterId: CharacterId;
  readonly score: number;
}

export interface SearchSuggestion {
  readonly suggestion: string;
  readonly score: number;
}

/** One evidence segment inside a {@link DiscoverCharacter} — a verbatim lived-scene block matching the query. */
export interface DiscoverSegment {
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly snippet: string;
  readonly score: number;
}

/** A group-scene block credits every co-star present in it, so one segment can be evidence for several characters. */
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

/** CSLS applies here (same-space image↔image), unlike the cross-modal images verb which skips it. */
export interface SimilarArtHit {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly lens: ImageLens;
}

/** score is the raw cosine distance, not CSLS-adjusted — hub_score inverts a cross-modal ranking so the
 *  verb deliberately omits it. */
export interface ImageSearchHit {
  readonly assetId: AssetId;
  readonly score: number;
  readonly lens: ImageLens;
  readonly caption: string | null;
}
