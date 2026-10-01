// Memory retrieval options and immutable Corpus evidence are shared boundary shapes.
// Search execution params and internal scan rows remain in the server domain contracts.

import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import type { ImageLens } from "../embeddings/index.ts";
import type { CorpusSource } from "./source.ts";

// The chat-scoped retrieval-mode axis: off | mixA (all tier-0, chronological) | mixB (+vector retrieve)
// | mixC (+rerank) | tiered (consolidation bridge). `contracts/settings`'s memory defaults enum derives
// from this tuple.
export const MEMORY_RETRIEVAL_MODES = ["off", "mixA", "mixB", "mixC", "tiered"] as const;
export type MemoryRetrievalMode = (typeof MEMORY_RETRIEVAL_MODES)[number];
export const memoryRetrievalModeSchema = z.enum(MEMORY_RETRIEVAL_MODES) satisfies z.ZodType<MemoryRetrievalMode>;

/** The `search.suggest` autocomplete page CEILING, enforced at the transport trust boundary (the
 *  `CHARACTER_LIST_MAX_LIMIT` precedent) — an over-bound ask is a BAD_REQUEST rather than an unbounded
 *  suggestion fetch. Clients ask ≤ 8. */
export const SEARCH_SUGGEST_MAX_LIMIT = 100;

/** The `topN` CEILING for the vector-search verbs (`search.search`, `search.fields`, `search.similarArt` /
 *  `similarCharacters`), enforced at the transport trust boundary. Same #45 class as a `limit` field — a
 *  top-N over a growing embedding corpus — just spelled `topN`; an over-bound ask is a BAD_REQUEST rather
 *  than an unbounded ranked fetch. Clients ask ≤ 20. */
export const SEARCH_TOP_N_MAX = 200;

/** The block-level identity of one digest/segment block. `search.corpus` dedupes ranked blocks by this
 *  key, and `memory`'s tiered bridge passes the surviving keys as `MemoryQueryOptions.candidates`.
 *  `scopedCharacterId` carries the egocentric POV: two scoped-group characters can produce digests for
 *  the SAME `(chatId, tier, blockIdx)` from different POVs, so it's part of the key — always a real
 *  branded `CharacterId`, never `''` or null. */
export interface BlockKey {
  chatId: ChatId;
  tier: number;
  blockIdx: number;
  scopedCharacterId: CharacterId;
}

/** ONE RANKED BLOCK as retrieval hands it back across the domain seam — the block's identity plus BOTH
 *  ranking readouts, so a caller that has to EXPLAIN a result (memory's recall trace, #250) is not left
 *  holding an unattributed key. `score` is the CSLS-adjusted rank signal (LOWER = closer, never rendered);
 *  `relevance` is cosine `1 − distance` (HIGHER = closer, the number a surface prints) — the split
 *  `domain/search/contract/results.ts` owns and states in full. Search's own `DigestSearchHit` EXTENDS this
 *  (it adds the source text a prompt assembler needs), so the two can never drift. */
export interface ScoredBlock {
  readonly blockKey: BlockKey;
  readonly score: number;
  readonly relevance: number;
}

/** The cross-domain options `memory.recall` threads into `search.digests`/`search.corpus`. `memory`
 *  builds the egocentric query text itself (pre-call); `search` owns the scan. */
export interface MemoryQueryOptions {
  /** First-class chat-scope — the scan is restricted to this one chat. */
  scope: { chat: ChatId };
  /** The chat HOST — the owner of the digest space this scan reads (vector tasks are owner-scoped: the
   *  entity owner's `embed`/`rerank` bindings define the space and fund the query, inference program §7.5). */
  ownerId: UserId;
  /** The recent-window retrieval query text: `memory` assembles the egocentric (name-prefixed) query
   *  pre-call; `search` embeds + scans it (mixB/mixC). Absent for the non-embedding modes. */
  queryText?: string | undefined;
  /** The active speaker's own witnessed bucket for a within-chat recall. Always a real `CharacterId`,
   *  never `''` or null. Absent for an owner-wide cross-chat scan with no single egocentric POV. */
  scopedCharacterId?: CharacterId | undefined;
  /** The tiered bridge restriction: `memory` computes coverage and passes the surviving block-keys;
   *  `search` scores ONLY these. Absent ⇒ scan the full scoped pool. */
  candidates?: BlockKey[] | undefined;
  mode: MemoryRetrievalMode;
  /** Fold keyword-overlap hits into the kept set even below the cosine floor. */
  keywordMatch: boolean;
  /** Raw-cosine inclusion floor. */
  minScore: number;
  /** The vector candidate pool size for mixB/mixC — the cosine-ranked, floor-passing pool is cut to its top
   *  `retrieveK` (the neo "top retrieveK" retrieval count). In mixC this is the pool the cross-encoder reranks. */
  retrieveK: number;
  /** The mixC rerank cut — after the cross-encoder reorders the retrieved pool, keep the top `rerankTo`. */
  rerankTo: number;
}

export type {
  CorpusDigestSource,
  CorpusSource,
  CorpusSourceOutcome,
  CorpusSourceState,
  MessageWindowCursor,
  MessageWindowTarget,
  ResolveCorpusSourceState,
} from "./source.ts";
export { CORPUS_SOURCE_OUTCOMES, corpusSourceSchema, messageWindowCursorSchema, messageWindowTargetSchema } from "./source.ts";

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
  readonly source: Extract<CorpusSource, { kind: "digest" }>;
  readonly chatTitle: string | null;
  readonly scopedCharacterName: string | null;
}

/** One evidence segment inside a discovery character hit — a verbatim lived-scene block matching the query.
 *  `chatTitle` is the room's authored title (null when unnamed — the client falls back through
 *  `deriveChatTitle` to the hit's own character), so the evidence group names a room instead of `Chat gr10xx`. */
export interface DiscoverSegment {
  readonly source: Extract<CorpusSource, { kind: "segment" }>;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly snippet: string;
  readonly score: number;
  readonly relevance: number;
  readonly chatTitle: string | null;
}

/** score is the raw cosine distance, not CSLS-adjusted — hub_score inverts a cross-modal ranking so the
 *  verb deliberately omits it. */
export interface ImageSearchHit {
  readonly assetId: AssetId;
  /** The matched blob's CAS hash — an image result has to be able to SHOW the image (side-eye corpus
   *  re-pass U4). Projected off the `assets` row the scan already joins for the owner belt. */
  readonly hash: string;
  /** The current owned character wearing this asset, or null for an unattached asset detail. */
  readonly characterId: CharacterId | null;
  readonly characterName: string | null;
  readonly score: number;
  readonly relevance: number;
  readonly lens: ImageLens;
  readonly caption: string | null;
}
