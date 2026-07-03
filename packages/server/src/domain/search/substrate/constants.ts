// domain/search/substrate/constants — the numeric pool-sizing tunables.
// Pure constants + deterministic over-fetch budgets; no I/O. These make top-k STABLE under CSLS + rerank:
// an exact `vector_distance_cos` scan is cheap, so we over-fetch a wider pool than `topN`, hub-adjust it,
// then (optionally) rerank a budget-capped slice of that pool before capping to `topN`. Tightening any
// constant trades recall for latency.
//
// W2 CORE defines the constants the built verbs (`knn`/`findCharacters`/`digests`/`segments`/`corpus`)
// consume, including `SCOPED_POOL_K` (the chat-memory full-pool cap). The discover budgets
// (`DISCOVER_SEGMENT_POOL_*`, `CSLS_POOL_FACTOR`) land with their deferred verbs.

/** Over-fetch multiplier for the initial owner-scoped vector scan: fetch `OWNER_OVERFETCH × topN`
 *  candidates so CSLS hub-adjust + rerank can reorder a deep-enough pool without truncating real hits. */
export const OWNER_OVERFETCH = 4;

/** Rerank budget cap multiplier: the cross-encoder is the expensive step, so it scores only the top
 *  `RERANK_POOL_FACTOR × topN` CSLS-ranked candidates (CSLS pre-filters the long tail). */
export const RERANK_POOL_FACTOR = 3;

/** The hard cap on a chat-memory full-pool scan (`digests`/`segments`/`corpus` with NO `candidates`
 *  restriction). The within-chat pool is small (one chat's aged-out blocks); the cross-chat corpus pool is
 *  the owner's materialized set — bounded at this corpus scale. When `candidates` is present the cap is the
 *  candidate count (the tiered bridge already bounds the scan). */
export const SCOPED_POOL_K = 200;
