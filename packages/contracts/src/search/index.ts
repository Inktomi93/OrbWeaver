// Memory retrieval options and immutable Corpus evidence are shared boundary shapes.
// Search execution params and internal scan rows remain in the server domain contracts.

import type { AssetId, CharacterId, ChatId, DocumentChunkId, DocumentId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { ImageLens } from "../embeddings/index.ts";
import { imageLensSchema } from "../embeddings/index.ts";
import type { CorpusSource } from "./source.ts";
import { corpusSourceSchema } from "./source.ts";

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
  readonly source: CorpusSource;
  /** Stored digest identities usable by the memory bridge; standalone transcripts carry none. */
  readonly blockKeys: readonly BlockKey[];
  readonly chatTitle: string | null;
  readonly relevance: number;
  readonly score: number;
  readonly text: string;
}

/** score is the BM25 score (higher = better) — the lexical surface's own unit, never mixed with CSLS. The
 *  name and avatar are read with the hit, so a hit names its card whatever page of the library it sits on. */
export interface FieldSearchHit {
  readonly characterId: CharacterId;
  readonly score: number;
  readonly name: string;
  readonly avatarHash: string | null;
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

/** Character credit and uncredited transcript evidence remain separate; no synthetic character identity. */
export interface DiscoverResult {
  readonly hits: readonly DiscoverCharacter[];
  readonly standaloneSegments: readonly DiscoverSegment[];
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
  | ({ readonly over: "discover" } & DiscoverResult)
  | { readonly over: "segments"; readonly hits: readonly SegmentSearchHit[] }
  | { readonly over: "digests"; readonly hits: readonly DigestSourceHit[] }
  | { readonly over: "corpus"; readonly hits: readonly CorpusHit[] }
  | { readonly over: "images"; readonly hits: readonly ImageSearchHit[] }
  | { readonly over: "documents"; readonly hits: readonly DocumentChunkHit[] };

const [segmentSource, digestSource] = corpusSourceSchema.options;
const strictSegmentSource = segmentSource.strict();
const strictDigestSource = digestSource.strict();
const strictCorpusSource = z.discriminatedUnion("kind", [strictSegmentSource, strictDigestSource]);

export const blockKeySchema = z.strictObject({
  chatId: typeIdSchema(ID_PREFIX.chat),
  tier: z.number(),
  blockIdx: z.number(),
  scopedCharacterId: typeIdSchema(ID_PREFIX.character),
}) satisfies z.ZodType<BlockKey>;

export const scoredBlockSchema = z.strictObject({
  blockKey: blockKeySchema,
  score: z.number(),
  relevance: z.number(),
}) satisfies z.ZodType<ScoredBlock>;

export const digestSearchHitSchema = scoredBlockSchema.extend({ text: z.string() }) satisfies z.ZodType<DigestSearchHit>;
export const digestSourceHitSchema = digestSearchHitSchema.extend({
  source: strictDigestSource,
  chatTitle: z.string().nullable(),
  scopedCharacterName: z.string().nullable(),
}) satisfies z.ZodType<DigestSourceHit>;

export const discoverSegmentSchema = z.strictObject({
  source: strictSegmentSource,
  chatId: typeIdSchema(ID_PREFIX.chat),
  blockIdx: z.number(),
  snippet: z.string(),
  score: z.number(),
  relevance: z.number(),
  chatTitle: z.string().nullable(),
}) satisfies z.ZodType<DiscoverSegment>;

export const imageSearchHitSchema = z.strictObject({
  assetId: typeIdSchema(ID_PREFIX.asset),
  hash: z.string(),
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  characterName: z.string().nullable(),
  score: z.number(),
  relevance: z.number(),
  lens: imageLensSchema,
  caption: z.string().nullable(),
}) satisfies z.ZodType<ImageSearchHit>;

export const searchHitSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  score: z.number(),
  relevance: z.number(),
}) satisfies z.ZodType<SearchHit>;

export const characterCardHitSchema = searchHitSchema.extend({
  name: z.string(),
  avatarHash: z.string().nullable(),
  genre: z.string().nullable(),
  tone: z.string().nullable(),
  elevatorPitch: z.string().nullable(),
}) satisfies z.ZodType<CharacterCardHit>;

export const segmentSearchHitSchema = z.strictObject({
  blockKey: blockKeySchema,
  score: z.number(),
  text: z.string(),
}) satisfies z.ZodType<SegmentSearchHit>;

export const corpusHitSchema = z.strictObject({
  source: strictCorpusSource,
  blockKeys: z.array(blockKeySchema).readonly(),
  chatTitle: z.string().nullable(),
  relevance: z.number(),
  score: z.number(),
  text: z.string(),
}) satisfies z.ZodType<CorpusHit>;

export const fieldSearchHitSchema = z.strictObject({
  characterId: typeIdSchema(ID_PREFIX.character),
  score: z.number(),
  name: z.string(),
  avatarHash: z.string().nullable(),
}) satisfies z.ZodType<FieldSearchHit>;

export const fieldSearchResultSchema = z.strictObject({
  hits: z.array(fieldSearchHitSchema).readonly(),
  coverage: z.strictObject({ requestLimit: z.number(), indexedCharacters: z.number(), matchingCharacters: z.number() }),
}) satisfies z.ZodType<FieldSearchResult>;

export const searchSuggestionSchema = z.strictObject({ suggestion: z.string(), score: z.number() }) satisfies z.ZodType<SearchSuggestion>;

export const discoverCharacterSchema = characterCardHitSchema.extend({
  matchCount: z.number(),
  segments: z.array(discoverSegmentSchema).readonly(),
}) satisfies z.ZodType<DiscoverCharacter>;

export const discoverResultSchema = z.strictObject({
  hits: z.array(discoverCharacterSchema).readonly(),
  standaloneSegments: z.array(discoverSegmentSchema).readonly(),
}) satisfies z.ZodType<DiscoverResult>;

export const similarArtHitSchema = searchHitSchema.extend({
  name: z.string(),
  avatarHash: z.string().nullable(),
  lens: imageLensSchema,
}) satisfies z.ZodType<SimilarArtHit>;

export const documentChunkHitSchema = z.strictObject({
  documentId: typeIdSchema(ID_PREFIX.document),
  documentName: z.string(),
  chunkId: typeIdSchema(ID_PREFIX.documentChunk),
  chunkIdx: z.number(),
  content: z.string(),
  score: z.number(),
  contentHash: z.string(),
}) satisfies z.ZodType<DocumentChunkHit>;

const searchCoverageSchema = z.strictObject({
  requestLimit: z.number(),
  candidateLimit: z.number(),
  evidencePerCharacter: z.number().nullable(),
  reranked: z.boolean(),
}) satisfies z.ZodType<SearchCoverage>;

export const unifiedSearchRowsSchema = z.discriminatedUnion("over", [
  z.strictObject({ over: z.literal("entities"), hits: z.array(searchHitSchema).readonly() }),
  z.strictObject({ over: z.literal("characters"), hits: z.array(characterCardHitSchema).readonly() }),
  discoverResultSchema.extend({ over: z.literal("discover") }),
  z.strictObject({ over: z.literal("segments"), hits: z.array(segmentSearchHitSchema).readonly() }),
  z.strictObject({ over: z.literal("digests"), hits: z.array(digestSourceHitSchema).readonly() }),
  z.strictObject({ over: z.literal("corpus"), hits: z.array(corpusHitSchema).readonly() }),
  z.strictObject({ over: z.literal("images"), hits: z.array(imageSearchHitSchema).readonly() }),
  z.strictObject({ over: z.literal("documents"), hits: z.array(documentChunkHitSchema).readonly() }),
]) satisfies z.ZodType<UnifiedSearchRows>;

const [entitiesRows, charactersRows, discoverRows, segmentRows, digestRows, corpusRows, imageRows, documentRows] = unifiedSearchRowsSchema.options;
const searchCoverageFields = { coverage: searchCoverageSchema };
export const unifiedSearchResultSchema = z.discriminatedUnion("over", [
  entitiesRows.extend(searchCoverageFields),
  charactersRows.extend(searchCoverageFields),
  discoverRows.extend(searchCoverageFields),
  segmentRows.extend(searchCoverageFields),
  digestRows.extend(searchCoverageFields),
  corpusRows.extend(searchCoverageFields),
  imageRows.extend(searchCoverageFields),
  documentRows.extend(searchCoverageFields),
]) satisfies z.ZodType<UnifiedSearchResult>;
