// @orb/kit/chunk — the pure recursive text splitter (databank-design/03). A pure ENGINE in the kit/macro /
// kit/regex class: zero I/O, zero domain deps, isomorphic (the client chunk-count preview imports the same
// function). Gate: kit-purity + test-determinism. The zod wire twin of {@link ChunkParams} lives in
// `@orb/contracts/databank` (chunkParamsSchema) and is pinned to this shape by a `satisfies` check THERE —
// kit stays zod-free and dependency-bottom.
//
// Char-based sizing (not tokens): token counting needs a model-coupled tokenizer heavier than this job
// warrants; ST's char contract (~2500 chars ≈ 600–700 tokens) is field-proven for embed inputs, and coupling
// the chunk layout to a tokenizer would spuriously reindex every document on a tokenizer swap (03 §1). The
// slices are canon-verbatim — the chunker normalizes NOTHING (extraction normalizes newlines first, 04 §2).

import { splitRecursive } from "./split.ts";

export { CHUNK_SEPARATORS } from "./split.ts";

/** Chunking parameters. The zod wire twin (`@orb/contracts/databank` chunkParamsSchema) is pinned to this
 *  shape by a `satisfies` check THERE. */
export interface ChunkParams {
  /** Max chunk length in UTF-16 code units (chars). Default 2500 (ST chunk_size_db). */
  readonly chunkSize: number;
  /** Overlap carried from the previous chunk, as a percent of chunkSize (0–50). Default 0. */
  readonly overlapPercent: number;
  /** `text.length <= this` ⇒ return the whole text as one chunk. Default 5120 (ST: files ≤5 KB embed
   *  whole — a short doc chunked to fragments retrieves WORSE than whole). */
  readonly wholeFileThreshold: number;
}

export interface TextChunk {
  /** Reading order. 0-based, contiguous. THE retrieval restore key. */
  readonly idx: number;
  /** The slice handed to the embedder: the `[start, end)` span, PREFIXED by the overlap tail of the previous
   *  chunk when `overlapPercent > 0`. */
  readonly content: string;
  /** Char offset (inclusive) of the NON-overlap span in the input text. */
  readonly start: number;
  /** Char offset (exclusive). The `[start, end)` spans of all chunks PARTITION the input. */
  readonly end: number;
}

const PERCENT = 100;

/** Pure, deterministic, total. Never throws on any string input.
 *
 *  Properties (the property tests): (1) lossless partition — slicing the input by every chunk's `[start, end)`
 *  in `idx` order reproduces it; (2) bound — every `content` fits `chunkSize` plus the overlap chars
 *  (whole-file case exempt); (3) contiguity — `idx` is `0..n-1` and chunks abut (`chunks[i].end` equals
 *  `chunks[i+1].start`); (4) determinism; (5) totality. */
export function chunkText(text: string, params: ChunkParams): TextChunk[] {
  if (text.length === 0) {
    return [];
  }
  if (text.length <= params.wholeFileThreshold) {
    return [{ idx: 0, content: text, start: 0, end: text.length }];
  }

  const spans = splitRecursive(text, 0, params.chunkSize, 0);
  const overlap = params.overlapPercent > 0 ? Math.floor((params.chunkSize * params.overlapPercent) / PERCENT) : 0;

  return spans.map((span, idx) => {
    // idx 0 has no previous chunk to borrow from; the span IS the content. For idx >= 1 with overlap on,
    // prefix the previous chunk's tail — clamped to the previous span's start so a chunk never reaches past
    // its predecessor. The [start, end) partition is untouched (overlap lives only on `content`).
    const prev = spans[idx - 1];
    const contentStart = idx > 0 && overlap > 0 && prev !== undefined ? Math.max(span.start - overlap, prev.start) : span.start;
    return { idx, content: text.slice(contentStart, span.end), start: span.start, end: span.end };
  });
}
