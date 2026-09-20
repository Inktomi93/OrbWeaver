// domain/search/substrate/constants — the retrieval tunables. Pure constants, no I/O. Tightening any
// pool-sizing constant trades recall for latency: over-fetch a wider pool than topN, hub-adjust it, then
// optionally rerank a budget-capped slice before capping to topN. `CAPTION_LENS` at the foot is the one
// non-numeric member: the lens the joint-space fallback forces, homed here because two verbs read it.

import type { ImageLens } from "@orb/contracts/embeddings";

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

/** `documents` lens fallbacks (databank-design/05 §3.7 — ST's shipped `chunk_count_db`/`score_threshold`).
 *  The real caller passes settings values; these keep the verb total when `k`/`minScore` are omitted. */
export const DEFAULT_DOCUMENT_K = 5;
export const DEFAULT_DOCUMENT_MIN_SCORE = 0.25;

/** THE ONLY LENS THAT EXISTS IN THE CAPTIONED-TEXT FALLBACK SPACE (§10-3). When an owner has no
 *  image-capable embedder their pictures are caption vectors in their TEXT space — no `image-raw` row was
 *  ever written — so both image-reading verbs force this lens rather than scanning a table that cannot have
 *  a matching row. One home, because a second spelling is how the two verbs would drift apart. */
export const CAPTION_LENS: ImageLens = "image-captioned";
