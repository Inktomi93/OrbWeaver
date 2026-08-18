// domain/chat/memory/build/substrate/token-guard — fit a summarizer call to the user's ACTUAL context
// (core/Knowledge-Cluster.md §3a/§10). PURE CPU, deterministic (no clock/random, no I/O). A summarizer is a `chat`-turn
// on the user's own backend, so the context is whatever that backend has (a tiny local main, 32k, or hosted
// 200k). `blockSize 8 ≈ 3k tok` fits any reasonable summarizer, but the GUARD is the real safety — a giant
// pasted message or a small-context main must NEVER silently truncate the block tail: degrade VISIBLY by
// trimming oldest-within-block to fit, or skip-and-flag when even the newest single message overflows.

import { DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS } from "@orb/contracts/settings";
import type { RowMacroNameContext } from "@orb/kit/macro";
// The CANONICAL estimator (one home, §7.5). QuadChars counts each non-ASCII codepoint (CJK/emoji/accented) as
// 1 token; a local `length/4` undercounts those ~4× and would let a CJK transcript silently overflow the
// summarizer — the exact truncation this guard exists to prevent. Never re-roll the estimate here.
import { estimateTokens, safeTokenWindow, splitToTokenBudget } from "@orb/kit/tokens";
import type { MsgRow, SegmentChunk } from "../../types.ts";
import { renderRowLine, renderTranscript } from "./transcript.ts";

/** The baseline tokens reserved for the digest OUTPUT + the prompt scaffold (the system prompt is subtracted
 *  separately). The EFFECTIVE reserve is `AppSettings.memorySummarizer.maxTokens ?? this` — the one home the
 *  summarize REQUEST's `max_tokens` and this fit-reserve both read, so they can't diverge (the
 *  `materializeOutputReserve` one-home rule). The VALUE is owned by `@orb/contracts/settings`
 *  (`DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS`) so the admin surface displays the same floor this reserve uses —
 *  derived, never re-hardcoded. */
export const DEFAULT_OUTPUT_RESERVE_TOKENS = DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS;

/** The §10 config-time floor: below this resolved summarizer context, even a small block + output is risky →
 *  emit the soft-warning at build start (the degrade is visible, never silent). */
export const SUMMARIZER_CONTEXT_FLOOR = 4096;

/** Tokens held back from the embed window for the ChatML scaffold the embed surface wraps every input in
 *  (system instruction + four role markers ≈ 30 estimated tokens) plus slack for tokenizer disagreement. */
const EMBED_SCAFFOLD_RESERVE_TOKENS = 64;

/** The PATHOLOGICAL ceiling (#172): above this many chunks a single block stops being chunked and is skipped
 *  WHOLE-and-recorded (the #165 arm, which survives for exactly this case). Sized far above the real corpus —
 *  its worst block is a 200k-char code dump, ≈5 chunks at the box's 8192-token embed window — so the ceiling
 *  only ever catches something absurd (a 100MB paste), where N thousand vectors of one block would drown the
 *  recall pool and cost more than the content is worth. A skip here is COUNTED and logged, never silent. */
export const MAX_SEGMENT_CHUNKS_PER_BLOCK = 64;

/** One row's transcript line, pre-rendered with its token estimate — the chunker packs these. */
interface RenderedLine {
  readonly seq: number;
  readonly label: string;
  readonly body: string;
  readonly tokens: number;
}

/** Newline cost between two packed lines (`renderTranscript` joins with `\n`, and a newline is one token by
 *  the QuadChars estimator). */
const JOIN_TOKENS = 1;

/** Pack consecutive whole LINES into chunks of at most `budget` tokens. A line that cannot fit alone is
 *  returned as its own over-budget chunk for the caller to split (see {@link chunkBlockForEmbedWindow}). */
function packLines(lines: readonly RenderedLine[], budget: number): RenderedLine[][] {
  const packed: RenderedLine[][] = [];
  let current: RenderedLine[] = [];
  let currentTokens = 0;
  for (const line of lines) {
    const cost = current.length === 0 ? line.tokens : line.tokens + JOIN_TOKENS;
    if (current.length > 0 && currentTokens + cost > budget) {
      packed.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(line);
    currentTokens += current.length === 1 ? line.tokens : cost;
  }
  if (current.length > 0) {
    packed.push(current);
  }
  return packed;
}

/** Split ONE over-budget line into consecutive pieces, each re-carrying the speaker label so every piece is a
 *  readable, attributable transcript fragment (an unlabelled tail would embed as anonymous text). */
function splitOversizedLine(line: RenderedLine, budget: number): string[] {
  const prefix = `${line.label}: `;
  const bodyBudget = budget - estimateTokens(prefix);
  const pieces = splitToTokenBudget(line.body, bodyBudget);
  // `bodyBudget <= 0` (an absurd label against a tiny window) ⇒ no piece can carry the label; fall back to the
  // bare body so the CONTENT still survives — losing the label beats losing the message.
  return pieces.length === 0 ? splitToTokenBudget(line.body, budget) : pieces.map((p) => `${prefix}${p}`);
}

/**
 * CHUNK a verbatim block to the EMBED model's window — the segment counterpart of {@link fitBlockToBudget},
 * and deliberately a CHUNKER rather than a fitter or a clamp. A digest is a SUMMARY (trimming the oldest
 * message still yields an honest summary of what is left), while a segment is the VERBATIM ground truth a
 * digest hit resolves back to: truncating one produces a vector that claims a seq-span it never read, and the
 * tail of memory-feeding content vanishes with no trace (owner ruling, #165 — "if we are skimping out on
 * messages that's a no go since this feeds the memory system"). So an oversized block becomes N in-budget
 * chunks and NOTHING is lost.
 *
 * SPAN HONESTY is the invariant that makes chunking safe. Chunks cut at MESSAGE boundaries wherever possible,
 * so each chunk's `(seqStart, seqEnd)` is exactly the range of messages its text contains. A single message
 * bigger than the whole window is split into pieces that all carry THAT ONE message's seq — the finest honest
 * granularity available, and still true: every piece's span contains every message the piece quotes.
 *
 * Returns `null` when the block cannot be chunked at all — a non-positive budget, or more than
 * {@link MAX_SEGMENT_CHUNKS_PER_BLOCK} chunks (the pathological ceiling) — and the caller skips-and-RECORDS.
 */
export function chunkBlockForEmbedWindow(
  rows: readonly MsgRow[],
  macroNames: RowMacroNameContext,
  embedContextTokens: number,
): SegmentChunk[] | null {
  // The window is DISCOUNTED before the flat scaffold reserve (#187): the QuadChars estimate undercounts the
  // engine's real tokenizer proportionally (measured up to 1.4156× on this corpus), and 6 of the 30 largest
  // blocks cut to the undiscounted budget were refused 400 "at least 8193 input tokens". Chunking more finely
  // costs packing density and loses NOTHING — a rejected chunk loses the whole flood's write.
  const budget = safeTokenWindow(embedContextTokens) - EMBED_SCAFFOLD_RESERVE_TOKENS;
  if (budget <= 0 || rows.length === 0) {
    return null;
  }
  const whole = renderTranscript(rows, macroNames);
  const first = rows.at(0);
  const last = rows.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  // THE COMMON CASE — one chunk covering the whole block, byte-identical to the pre-chunking segment text.
  if (estimateTokens(whole) <= budget) {
    return [{ chunkIdx: 0, seqStart: first.seq, seqEnd: last.seq, text: whole }];
  }

  const lines: RenderedLine[] = rows.map((r) => {
    const { label, body } = renderRowLine(r, macroNames);
    return { seq: r.seq, label, body, tokens: estimateTokens(`${label}: ${body}`) };
  });
  const chunks: SegmentChunk[] = [];
  for (const group of packLines(lines, budget)) {
    const groupFirst = group.at(0);
    const groupLast = group.at(-1);
    if (groupFirst === undefined || groupLast === undefined) {
      continue;
    }
    const text = group.map((l) => `${l.label}: ${l.body}`).join("\n");
    // A group of ≥2 lines always fits (packLines only exceeds the budget on a SINGLE unsplittable line).
    const texts = group.length === 1 && estimateTokens(text) > budget ? splitOversizedLine(groupFirst, budget) : [text];
    for (const t of texts) {
      chunks.push({ chunkIdx: chunks.length, seqStart: groupFirst.seq, seqEnd: groupLast.seq, text: t });
      if (chunks.length > MAX_SEGMENT_CHUNKS_PER_BLOCK) {
        return null; // the pathological ceiling — skip-and-record (#165's surviving arm)
      }
    }
  }
  return chunks.length === 0 ? null : chunks;
}

/**
 * Fit a block's rows to the summarizer transcript budget by trimming OLDEST-within-block until the rendered
 * transcript fits `contextTokens` (minus the system prompt + the output reserve). Returns the kept rows, or
 * `null` when even the single newest message overflows (the caller skips-and-flags — never silent truncation).
 * `contextTokens ≤ 0` ⇒ no room at all ⇒ `null`. `outputReserveTokens` = the SAME `max_tokens` the summarize
 * request sends (the one-home rule; caller resolves `AppSettings.memorySummarizer.maxTokens ?? default`).
 */
export function fitBlockToBudget(
  rows: readonly MsgRow[],
  macroNames: RowMacroNameContext,
  contextTokens: number,
  systemPromptTokens: number,
  outputReserveTokens: number,
): MsgRow[] | null {
  const budget = contextTokens - systemPromptTokens - outputReserveTokens;
  if (budget <= 0) {
    return null;
  }
  let kept = [...rows];
  while (kept.length > 0 && estimateTokens(renderTranscript(kept, macroNames)) > budget) {
    kept = kept.slice(1); // drop the oldest message in the block (trim-to-fit, not truncate)
  }
  return kept.length > 0 ? kept : null;
}
