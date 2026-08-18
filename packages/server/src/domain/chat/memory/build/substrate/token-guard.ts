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
import { estimateTokens } from "@orb/kit/tokens";
import type { MsgRow } from "../../types.ts";
import { renderTranscript } from "./transcript.ts";

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

/**
 * Does a rendered verbatim block fit the EMBED model's window? The segment twin of {@link fitBlockToBudget},
 * and deliberately a BOOLEAN rather than a fitter: a digest is a SUMMARY (trimming the oldest message still
 * yields an honest summary of what is left), while a segment is the VERBATIM ground truth a digest hit
 * resolves back to. Trimming or truncating one produces a vector that claims to represent a seq-span it
 * never read — a lying embedding, and memory-feeding content silently lost (owner ruling, #165: "if we are
 * skimping out on messages that's a no go since this feeds the memory system"). So an over-window block is
 * SKIPPED AND RECORDED by the caller instead. The chunking arm — a block that does not fit becomes N
 * in-budget segments, losing nothing — is the ruled preference and needs a `chat_segments` key that admits
 * more than one row per `(chat, block)`; it rides its own lane.
 */
export function blockFitsEmbedWindow(renderedText: string, embedContextTokens: number): boolean {
  const budget = embedContextTokens - EMBED_SCAFFOLD_RESERVE_TOKENS;
  return budget > 0 && estimateTokens(renderedText) <= budget;
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
