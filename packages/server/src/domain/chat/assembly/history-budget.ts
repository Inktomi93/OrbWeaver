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

import type { MessageId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";

/** One shaped history entry, as handed to the completion runners. File-local (the cross-boundary wire
 *  shape is the providers' ChatHistoryMessage; this is SHAPE's internal turn shape). */
interface HistoryTurn {
  readonly role: "user" | "assistant";
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
}

// Per-message wire overhead (role markers the estimator doesn't see) + estimator-slop headroom.
const PER_MESSAGE_OVERHEAD = 4;
const SAFETY_MARGIN = 64;

/**
 * Trim `history` (oldest-first) so that `system + history + reservedOutput` fits the effective context
 * ceiling. The ceiling is the smaller of the model window and the user's soft cap; when neither is known
 * the history is returned untouched (we never trim blind). The most recent turn is always kept — even if
 * it alone exceeds the budget (an irreducible single oversized message; the caller may warn, but we
 * never silently drop the user's current turn).
 */
export function fitHistoryToWindow(
  history: readonly HistoryTurn[],
  budget: HistoryBudget,
): FitResult {
  const ceiling = Math.min(
    budget.windowTokens ?? Number.POSITIVE_INFINITY,
    budget.softMaxTokens ?? Number.POSITIVE_INFINITY,
  );
  // No trustworthy ceiling → don't trim (e.g. custom-openai with no knob set).
  if (!Number.isFinite(ceiling)) {
    return { history: [...history], droppedCount: 0, earliestKeptMessageId: null };
  }

  const promptBudget = ceiling - budget.systemTokens - budget.reserveOutputTokens - SAFETY_MARGIN;
  const cost = (t: HistoryTurn): number => estimateTokens(t.content) + PER_MESSAGE_OVERHEAD;

  // Walk newest→oldest. The newest turn is always kept regardless of budget (irreducible).
  let used = 0;
  let keepFrom = history.length; // index of the oldest KEPT turn
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn === undefined) {
      continue;
    }
    const next = used + cost(turn);
    const isNewest = i === history.length - 1;
    if (next > promptBudget && !isNewest) {
      break;
    }
    used = next;
    keepFrom = i;
  }

  if (keepFrom === 0) {
    return { history: [...history], droppedCount: 0, earliestKeptMessageId: null };
  }
  const kept = history.slice(keepFrom);
  return {
    history: kept,
    droppedCount: keepFrom,
    earliestKeptMessageId: kept.find((t) => t.messageId !== undefined)?.messageId ?? null,
  };
}
