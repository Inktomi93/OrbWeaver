// domain/chat/memory/build/substrate/token-guard — fit a summarizer call to the user's ACTUAL context
// (knowledge-cluster §3a/§10). PURE CPU, deterministic (no clock/random, no I/O). A summarizer is a `chat`-turn
// on the user's own backend, so the context is whatever that backend has (a tiny local main, 32k, or hosted
// 200k). `blockSize 8 ≈ 3k tok` fits any reasonable summarizer, but the GUARD is the real safety — a giant
// pasted message or a small-context main must NEVER silently truncate the block tail: degrade VISIBLY by
// trimming oldest-within-block to fit, or skip-and-flag when even the newest single message overflows.

import type { RowMacroNameContext } from "@orb/kit/macro";
// The CANONICAL estimator (one home, §7.5). QuadChars counts each non-ASCII codepoint (CJK/emoji/accented) as
// 1 token; a local `length/4` undercounts those ~4× and would let a CJK transcript silently overflow the
// summarizer — the exact truncation this guard exists to prevent. Never re-roll the estimate here.
import { estimateTokens } from "@orb/kit/tokens";
import type { MsgRow } from "../../types";
import { renderTranscript } from "./transcript";

/** Tokens reserved for the digest OUTPUT + the prompt scaffold (the system prompt is subtracted separately). */
const OUTPUT_RESERVE_TOKENS = 1024;

/** The §10 config-time floor: below this resolved summarizer context, even a small block + output is risky →
 *  emit the soft-warning at build start (the degrade is visible, never silent). */
export const SUMMARIZER_CONTEXT_FLOOR = 4096;

/**
 * Fit a block's rows to the summarizer transcript budget by trimming OLDEST-within-block until the rendered
 * transcript fits `contextTokens` (minus the system prompt + the output reserve). Returns the kept rows, or
 * `null` when even the single newest message overflows (the caller skips-and-flags — never silent truncation).
 * `contextTokens ≤ 0` ⇒ no room at all ⇒ `null`.
 */
export function fitBlockToBudget(
  rows: readonly MsgRow[],
  macroNames: RowMacroNameContext,
  contextTokens: number,
  systemPromptTokens: number,
): MsgRow[] | null {
  const budget = contextTokens - systemPromptTokens - OUTPUT_RESERVE_TOKENS;
  if (budget <= 0) {
    return null;
  }
  let kept = [...rows];
  while (kept.length > 0 && estimateTokens(renderTranscript(kept, macroNames)) > budget) {
    kept = kept.slice(1); // drop the oldest message in the block (trim-to-fit, not truncate)
  }
  return kept.length > 0 ? kept : null;
}
