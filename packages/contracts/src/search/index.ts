// `@orb/contracts/search` — the memory↔search query wire. Search params/result shapes are
// domain-internal (`domain/search/contract/{params,results}.ts`), reaching the client via tRPC
// inference. The one genuinely cross-boundary shape is `MemoryQueryOptions`: `memory.recall` constructs
// it and threads it across the domain seam into `search.digests`/`search.corpus`.

import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { z } from "zod";

// The chat-scoped retrieval-mode axis: off | mixA (all tier-0, chronological) | mixB (+vector retrieve)
// | mixC (+rerank) | tiered (consolidation bridge). `contracts/settings`'s memory defaults enum derives
// from this tuple.
export const MEMORY_RETRIEVAL_MODES = ["off", "mixA", "mixB", "mixC", "tiered"] as const;
export type MemoryRetrievalMode = (typeof MEMORY_RETRIEVAL_MODES)[number];
export const memoryRetrievalModeSchema = z.enum(MEMORY_RETRIEVAL_MODES);

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
