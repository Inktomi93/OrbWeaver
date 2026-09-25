// domain/chat/assembly/history-budget — the SHAPE fit-pass.
//
// Hard-cap safety net for stateless completion runners (vLLM / OpenRouter / custom-openai) where WE
// build the prompt and the backend won't protect us: vLLM 400s on overflow, OpenRouter silently
// middle-out-compresses by default. Reserves system prompt + output budget, then drops the OLDEST turns
// until the conversation fits, ALWAYS keeping the most recent turn. NOT compaction (that is the graceful
// agent-sdk-only layer above this).
//
// This is the FINAL SHAPE step, applied by the engine AFTER shape() returns (it needs the runner's
// resolved system-prompt token count + output reserve + window, known only post-BUILD/per-runner). The
// §8 cache breakpoint is an OFFSET-FROM-END, so a front-drop here preserves it structurally — no
// retagging needed. Token counting via the kit estimator (advisory; truth is provider `usage`).

import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";

/** One shaped history entry, as handed to the completion runners. File-local (the cross-boundary wire
 *  shape is the providers' ChatHistoryMessage; this is SHAPE's internal turn shape). */
interface HistoryTurn {
  /** The delivered wire-row role — the full `MessageRole` axis (`system` appears only as a capability-kept
   *  INJECTION row, at the tail `turns.midConversationSystem` or mid-array `turns.historySystemRows`; never a
   *  canon row, since the D129(B) narrator→`system` delivery was owner-ruled out 2026-08-18 — role-agnostic
   *  here either way). Derived, never re-spelled. */
  readonly role: MessageRole;
  readonly content: string;
  readonly name?: string;
  readonly messageId?: MessageId | undefined;
}

interface HistoryBudget {
  /** The model's trustworthy context window in tokens. Undefined when unknown (custom-openai's
   *  placeholder) — then only `softMaxTokens` can impose a ceiling. */
  readonly windowTokens?: number | undefined;
  /** User's `maxContextTokens` working-set cap. Lowers the ceiling. */
  readonly softMaxTokens?: number | undefined;
  /** Tokens reserved for the completion — MUST mirror the runner's effective `max_tokens`. */
  readonly reserveOutputTokens: number;
  /** Tokens the assembled system prompt (static + dynamic) will occupy. */
  readonly systemTokens: number;
}

interface FitResult {
  readonly history: HistoryTurn[];
  /** How many oldest turns were dropped (0 = fit as-is / no ceiling). For logging + trace. */
  readonly droppedCount: number;
  /** The id of the earliest-KEPT turn — the "last message inside context" boundary a client can render a
   *  divider at. `null` when nothing was dropped, or the fit-pass never ran, or no kept turn carries an
   *  id (a hand-built/preview call with bare `{role,content}` rows). */
  readonly earliestKeptMessageId: MessageId | null;
  /** The kept history's estimated token cost (message content + per-message overhead) — the "N used" the
   *  preview budget renders. Zero when there is no history. */
  readonly usedTokens: number;
  /** The effective ceiling the fit resolved against — `min(window, softMax)`, or `null` when neither is
   *  finite (no trustworthy ceiling ⇒ no trim). */
  readonly ceilingTokens: number | null;
}

// Per-message wire overhead (role markers the estimator doesn't see) + estimator-slop headroom.
const PER_MESSAGE_OVERHEAD = 4;
const SAFETY_MARGIN = 64;

/** The trim chunk as a fraction of the history's room (`ceiling − reserveOutputTokens`).
 *
 *  @remarks The prompt cache is an exact prefix, so a fit that drops one row per turn rewrites the whole kept
 *  history every turn. The cut snaps to a grid of chunks counted from the history's start instead, so
 *  consecutive turns pick the same cut until growth crosses the next boundary. The grid is derived from the rows
 *  and the budget alone, because the fit is stateless. The room excludes the system prompt: its dynamic half
 *  changes per turn, and a chunk that changes size moves every boundary. A module constant, not config: no
 *  user or deployment varies it.
 * @public Test-anchored module surface; the fit tests bound the extra drop by this chunk.
 */
export const HISTORY_TRIM_CHUNK_FRACTION = 0.1;

// The chunk the cut snaps to. Stable per chat: it reads only the ceiling and the output reserve.
function trimChunkTokens(ceiling: number, reserveOutputTokens: number): number {
  return Math.max(1, Math.round(HISTORY_TRIM_CHUNK_FRACTION * (ceiling - reserveOutputTokens)));
}

// The first row at or after `minimalCut` that starts on a chunk boundary, where a row's start is the summed cost
// of every row before it. Every row this drops beyond the minimal cut starts inside that cut's chunk.
function chunkAlignedCut(history: readonly HistoryTurn[], minimalCut: number, chunk: number): number {
  let start = history.slice(0, minimalCut).reduce((sum, turn) => sum + historyTurnTokens(turn), 0);
  const boundary = Math.ceil(start / chunk) * chunk;
  let cut = minimalCut;
  for (const turn of history.slice(minimalCut)) {
    if (start >= boundary) {
      break;
    }
    start += historyTurnTokens(turn);
    cut += 1;
  }
  return cut;
}

/** What ONE history row costs the fit: its estimated content tokens plus the per-message wire overhead. The
 *  one cost rule; the marker re-head after a trim (`substrate/wire-history` fitWireHistory) prices with it too. */
export function historyTurnTokens(turn: { readonly content: string }): number {
  return estimateTokens(turn.content) + PER_MESSAGE_OVERHEAD;
}

/** The materialized output reserve — the EFFECTIVE `max_tokens` the runner sends AND the fit reserves, one
 *  value so the two can't diverge (the pipeline's `materializeMaxOutput` + `fitBudget.reserveOutputTokens`
 *  read this). Unset ⇒ the shared response-length default (NOT the model's output cap). */
export function materializeOutputReserve(maxOutputTokens: number | undefined): number {
  return maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

/** Build the `HistoryBudget` from the resolved knobs — the ONE fit-budget derivation the engine turn AND the
 *  previewFit read, so the boundary can't drift between them. `windowTokens` = the model's window;
 *  `maxContextTokens` = the user's soft cap (undefined ⇒ the window is the ceiling); the reserve is
 *  materialized from `maxOutputTokens` and held under `outputCeiling`, the model's `output.maxTokens.max`
 *  (undefined when no model resolved), because the wire clamps `max_tokens` to that cap; `systemTokens` = the
 *  assembled system-prompt cost. */
export function buildHistoryBudget(args: {
  readonly windowTokens: number;
  readonly maxContextTokens: number | undefined;
  readonly maxOutputTokens: number | undefined;
  readonly systemTokens: number;
  readonly outputCeiling: number | undefined;
}): HistoryBudget {
  const reserve = materializeOutputReserve(args.maxOutputTokens);
  return {
    windowTokens: args.windowTokens,
    softMaxTokens: args.maxContextTokens,
    reserveOutputTokens: args.outputCeiling === undefined ? reserve : Math.min(reserve, args.outputCeiling),
    systemTokens: args.systemTokens,
  };
}

/**
 * Trim `history` (oldest-first) so that `system + history + reservedOutput` fits the effective context
 * ceiling. The ceiling is the smaller of the model window and the user's soft cap; when neither is known
 * the history is returned untouched (we never trim blind). A trim snaps its cut forward to the next chunk
 * boundary ({@link HISTORY_TRIM_CHUNK_FRACTION}): every row it drops beyond the minimal fit starts inside the
 * minimal cut's chunk. The IRREDUCIBLE TAIL — the newest id-bearing turn and everything after it — is
 * always kept, even when it alone exceeds the budget (the caller may warn, but we never silently drop the
 * user's current turn). Trailing id-less rows are shape synthetics
 * (continuation/group nudge, depth-0 injections) riding the turn they follow: anchoring the guarantee on
 * the newest ROW instead would, under a blown budget, keep only the nudge and drop the real message —
 * and leave the preview's boundary unnameable (no kept row carries an id).
 */
export function fitHistoryToWindow(history: readonly HistoryTurn[], budget: HistoryBudget): FitResult {
  const ceiling = Math.min(budget.windowTokens ?? Number.POSITIVE_INFINITY, budget.softMaxTokens ?? Number.POSITIVE_INFINITY);
  const cost = historyTurnTokens;
  // No trustworthy ceiling → don't trim (e.g. custom-openai with no knob set). Still report the full cost so
  // a preview shows honest usage even when nothing can be dropped.
  if (!Number.isFinite(ceiling)) {
    return {
      history: [...history],
      droppedCount: 0,
      earliestKeptMessageId: null,
      usedTokens: history.reduce((sum, t) => sum + cost(t), 0),
      ceilingTokens: null,
    };
  }

  const promptBudget = ceiling - budget.systemTokens - budget.reserveOutputTokens - SAFETY_MARGIN;

  // The irreducible-tail anchor: the newest id-bearing turn (falling back to the newest row when no row
  // carries an id — hand-built histories keep the old newest-row guarantee).
  let irreducibleFrom = history.length - 1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.messageId !== undefined) {
      irreducibleFrom = i;
      break;
    }
  }

  // Walk newest→oldest. Rows at/after the anchor are always kept regardless of budget (irreducible).
  let used = 0;
  let keepFrom = history.length; // index of the oldest KEPT turn
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn === undefined) {
      continue;
    }
    const next = used + cost(turn);
    if (next > promptBudget && i < irreducibleFrom) {
      break;
    }
    used = next;
    keepFrom = i;
  }

  if (keepFrom === 0) {
    return { history: [...history], droppedCount: 0, earliestKeptMessageId: null, usedTokens: used, ceilingTokens: ceiling };
  }
  // The irreducible tail still wins over the grid: the cut never passes the newest id-bearing turn.
  const cut = Math.min(chunkAlignedCut(history, keepFrom, trimChunkTokens(ceiling, budget.reserveOutputTokens)), irreducibleFrom);
  const kept = history.slice(cut);
  return {
    history: kept,
    droppedCount: cut,
    earliestKeptMessageId: kept.find((t) => t.messageId !== undefined)?.messageId ?? null,
    usedTokens: kept.reduce((sum, t) => sum + cost(t), 0),
    ceilingTokens: ceiling,
  };
}
