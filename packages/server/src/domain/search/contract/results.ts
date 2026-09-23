// domain/search/contract/results — every verb's *Result. `score` is always the CSLS-adjusted retrieval
// score (distance − 1 + hubScore; LOWER = closer) except where noted — when rerank is enabled the result
// ORDER reflects the cross-encoder but `score` stays the CSLS signal (mixing the two units would be a lie).
//
// `relevance` (on the hit shapes a USER-FACING surface renders) is the readout half of that split: cosine
// similarity, `1 − distance`, HIGHER = closer, hub-free (`substrate/csls.relevanceOf`, which carries the
// full why). `score` ranks and is never rendered; `relevance` renders and never ranks. A shape without it is
// one no surface prints a number for (memory recall, databank gather) — do not add it speculatively.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { BlockKey, ScoredBlock } from "@orb/contracts/search";
import type { AssetId, CharacterId, ChatId, DocumentChunkId, DocumentId } from "@orb/kit/ids";

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

/** A memory-digest hit as RETRIEVAL returns it — what `memory.recall` assembles a prompt from. EXTENDS the
 *  cross-domain {@link ScoredBlock} (the seam shape `memory`'s injected `searchDigests` op speaks) rather
 *  than re-spelling its three fields: this shape IS that one plus the source text, and the extends clause is
 *  what makes a widened seam fail `tsc` here instead of drifting. */
export interface DigestSearchHit extends ScoredBlock {
  readonly text: string;
}

/**
 * A digest hit plus WHERE IT CAME FROM — the shape a hit takes when it is going to be READ rather than
 * assembled into a prompt (the unified `digests` branch; corpus forensics §2.4/R1a, whose row rendered
 * `Chat 2y1mf5` because the wire carried nothing else nameable).
 *
 * It is a separate shape on purpose: `recall` calls the `digests` verb dozens of times a turn and renders
 * nothing, so paying two display joins there would buy a prompt assembler two strings it throws away.
 *
 * `chatTitle` is the room's AUTHORED title, empty-normalized to null; `scopedCharacterName` is the digest's
 * scoped-producer character — the CAST rung of the client's ONE title chain (`deriveChatTitle`), so an
 * unnamed room reads as the character whose memory it is instead of an id slice. Either is null when the row
 * vanished between the scan and the display join. NO timestamp: a digest row carries no time of its own, and
 * `chats.updatedAt` is when the ROOM was last touched rather than when the moment happened — a moment-level
 * stamp arrives with the moment artifact, not from a column that would read as a lie.
 */
export interface DigestSourceHit extends DigestSearchHit {
  readonly chatTitle: string | null;
  readonly scopedCharacterName: string | null;
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

/** One evidence segment inside a {@link DiscoverCharacter} — a verbatim lived-scene block matching the query.
 *  `chatTitle` is the room's authored title (null when unnamed — the client falls back through
 *  `deriveChatTitle` to the hit's own character), so the evidence group names a room instead of `Chat gr10xx`. */
export interface DiscoverSegment {
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly snippet: string;
  readonly score: number;
  readonly relevance: number;
  readonly chatTitle: string | null;
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

/** score is the raw cosine distance, not CSLS-adjusted — hub_score inverts a cross-modal ranking so the
 *  verb deliberately omits it. */
export interface ImageSearchHit {
  readonly assetId: AssetId;
  /** The matched blob's CAS hash — an image result has to be able to SHOW the image (side-eye corpus
   *  re-pass U4). Projected off the `assets` row the scan already joins for the owner belt. */
  readonly hash: string;
  /** The owned character wearing this asset as its avatar, or `null` when nothing wears it. This is the
   *  hit's DESTINATION: with a character it is a door onto that dossier, without one it is a preview and
   *  must not be dressed as a door. */
  readonly characterId: CharacterId | null;
  readonly characterName: string | null;
  readonly score: number;
  readonly relevance: number;
  readonly lens: ImageLens;
  readonly caption: string | null;
}

/** The unified search() result — discriminated by `over` (the {@link SearchTarget}), each branch carrying
 *  the underlying verb's hit shape. Exhaustive: a new SearchTarget without a branch here fails `tsc` at the
 *  dispatch's `assertNever`. */
export type UnifiedSearchResult =
  | { readonly over: "entities"; readonly hits: readonly SearchHit[] }
  | { readonly over: "characters"; readonly hits: readonly CharacterCardHit[] }
  | { readonly over: "discover"; readonly hits: readonly DiscoverCharacter[] }
  | { readonly over: "segments"; readonly hits: readonly SegmentSearchHit[] }
  | { readonly over: "digests"; readonly hits: readonly DigestSourceHit[] }
  | { readonly over: "corpus"; readonly hits: readonly CorpusHit[] }
  | { readonly over: "images"; readonly hits: readonly ImageSearchHit[] }
  | { readonly over: "documents"; readonly hits: readonly DocumentChunkHit[] };
