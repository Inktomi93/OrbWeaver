// domain/search/substrate/constants — numeric pool-sizing tunables. Pure constants, no I/O. Tightening any
// constant trades recall for latency: over-fetch a wider pool than topN, hub-adjust it, then optionally
// rerank a budget-capped slice before capping to topN.

/** Over-fetch multiplier for the initial owner-scoped vector scan. */
export const OWNER_OVERFETCH = 4;

/** Rerank budget cap multiplier — the cross-encoder scores only the top RERANK_POOL_FACTOR × topN. */
export const RERANK_POOL_FACTOR = 3;

/** Hard cap on a chat-memory full-pool scan with no candidates restriction. */
export const SCOPED_POOL_K = 200;

/** discover over-fetch multiplier: segments are grouped by character AFTER ranking, so a wide pool is
 *  needed to yield topN distinct characters once co-star blocks share evidence. */
export const DISCOVER_SEGMENT_POOL_FACTOR = 20;

/** Hard ceiling on discover's segment pool: min(topN × FACTOR, CAP). */
export const DISCOVER_SEGMENT_POOL_CAP = 400;

/** How many evidence segments discover keeps per grouped character. */
export const DISCOVER_SEGMENTS_PER_CHAR = 3;

/** Max characters a discover evidence snippet carries. */
export const SNIPPET_CHARS = 280;
