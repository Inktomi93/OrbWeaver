// domain/search/contract/results — every verb's *Result. `score` is always the CSLS-adjusted retrieval
// score (distance − 1 + hubScore; LOWER = closer) except where noted — when rerank is enabled the result
// ORDER reflects the cross-encoder but `score` stays the CSLS signal (mixing the two units would be a lie).
//
// `relevance` (on the hit shapes a USER-FACING surface renders) is the readout half of that split: cosine
// similarity, `1 − distance`, HIGHER = closer, hub-free (`substrate/csls.relevanceOf`, which carries the
// full why). `score` ranks and is never rendered; `relevance` renders and never ranks. A shape without it is
// one no surface prints a number for (memory recall, databank gather) — do not add it speculatively.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { BlockKey, CorpusDigestSource, CorpusSource, DigestSourceHit, DiscoverSegment, ImageSearchHit } from "@orb/contracts/search";
import type { CharacterId, DocumentChunkId, DocumentId } from "@orb/kit/ids";

export interface SearchHit {
  readonly characterId: CharacterId;
  readonly score: number;
  /** Carried here because `findCharacters` layers display over THIS hit — the raw distance dies inside knn
   *  otherwise, and a card row could then only render the clamped score. */
  readonly relevance: number;
}

/** A findCharacters hit — a {@link SearchHit} enriched with distilled card facets + the avatar CAS key. */
export interface CharacterCardHit {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly relevance: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
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

export interface FieldSearchResult {
  readonly hits: readonly FieldSearchHit[];
  readonly coverage: {
    readonly requestLimit: number;
    readonly indexedCharacters: number;
    readonly matchingCharacters: number;
  };
}

export interface SearchSuggestion {
  readonly suggestion: string;
  readonly score: number;
}

/** A group-scene block credits every co-star present in it, so one segment can be evidence for several characters. */
export interface DiscoverCharacter {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly relevance: number;
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
  readonly relevance: number;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly lens: ImageLens;
}

/** One databank chunk hit. `score` is the CSLS-adjusted retrieval score
 *  (LOWER = closer), preserved even when rerank reordered the list. `documentName` is joined from
 *  `documents` for the `# {name}` provenance header the slot renders; `contentHash` is the collapse key. */
export interface DocumentChunkHit {
  readonly documentId: DocumentId;
  readonly documentName: string;
  readonly chunkId: DocumentChunkId;
  readonly chunkIdx: number;
  readonly content: string;
  readonly score: number;
  readonly contentHash: string;
}

/** The unified search() result — discriminated by `over` (the {@link SearchTarget}), each branch carrying
 *  the underlying verb's hit shape. Exhaustive: a new SearchTarget without a branch here fails `tsc` at the
 *  dispatch's `assertNever`. */
interface SearchCoverage {
  readonly requestLimit: number;
  readonly candidateLimit: number;
  readonly evidencePerCharacter: number | null;
  readonly reranked: boolean;
}
export type UnifiedSearchResult = UnifiedSearchRows & { readonly coverage: SearchCoverage };
export type UnifiedSearchRows =
  | { readonly over: "entities"; readonly hits: readonly SearchHit[] }
  | { readonly over: "characters"; readonly hits: readonly CharacterCardHit[] }
  | { readonly over: "discover"; readonly hits: readonly DiscoverCharacter[] }
  | { readonly over: "segments"; readonly hits: readonly SegmentSearchHit[] }
  | { readonly over: "digests"; readonly hits: readonly DigestSourceHit[] }
  | { readonly over: "corpus"; readonly hits: readonly CorpusHit[] }
  | { readonly over: "images"; readonly hits: readonly ImageSearchHit[] }
  | { readonly over: "documents"; readonly hits: readonly DocumentChunkHit[] };

export type DigestSourceRow = Pick<CorpusDigestSource, "text" | "chatTitle" | "scopedCharacterName"> &
  Pick<Extract<CorpusSource, { kind: "digest" }>, "chatId" | "generationId" | "contentHash" | "blockIdx" | "tier" | "scopedCharacterId" | "fingerprint"> & {
    readonly id: Extract<CorpusSource, { kind: "digest" }>["rowId"];
  };

export type { DigestSearchHit, DigestSourceHit, DiscoverSegment, ImageSearchHit } from "@orb/contracts/search";
