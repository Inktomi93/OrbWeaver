// infra/providers/contract/resolve — the resolved-chat-knobs type home: the OUTPUT shape of the
// `(UserIntent × ModelCapability) → wire knobs` funnel (`infra/providers/resolve-chat.ts`). The ONE
// place the capability-RESOLVED chat decision is typed, so both sealed chat runners (agent-sdk +
// openrouter) consume an IDENTICAL resolved shape instead of each re-deriving the gating/guard policy.
// Infra-internal (behind the contract barrel): only resolve-chat builds these and the runners read them.
//
// The unions are DERIVED from the descriptor (`@orb/contracts/connection`) — never re-spelled (§7.4
// one-home / derive-don't-respell).

import type { EffortLevel, ReasoningDisplayMode, ReasoningMode } from "@orb/contracts/connection";

// The machine-dispatchable reason a knob was dropped/ignored — one code per DISTINCT site resolve-chat
// actually emits (no speculative extras; clamps are silent, so there is no clamp code). The human detail
// rides on `ResolvedWarning.message`. Consumers derive the union from this tuple (no inline re-spell).
export const WARNING_CODES = [
  // A sampling knob the model can't honor was dropped: a numeric knob with no descriptor range, OR a
  // boolean-gated knob (seed/logitBias/stop) whose flag is off.
  "sampling_knob_dropped",
  // The requested effort isn't in the model's published `effortLevels`.
  "effort_dropped",
  // An explicit reasoning budget was dropped because the model is adaptive (Esoteric §8: sending it 400s).
  "adaptive_budget_dropped",
  // The requested `thinkingDisplay` isn't in the model's `displayModes`.
  "display_dropped",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

/** A structured, machine-dispatchable warning: a stable `code` for routing + the readable `message`. */
export interface ResolvedWarning {
  readonly code: WarningCode;
  readonly message: string;
}

/**
 * The capability-RESOLVED reasoning decision — the funnel's verdict AFTER the adaptive/budget guard, the
 * effort-levels clamp, and the display gate. A runner maps this straight onto its wire shape (the kit
 * `ReasoningRequest` / the SDK `ThinkingConfig`); it carries NO un-gated user values.
 */
export interface ResolvedReasoning {
  /** HOW the model reasons (mirrors the descriptor's `reasoning.mode`). */
  readonly mode: ReasoningMode;
  /** The on/off decision: the model CAN reason AND the user asked (a real effort, not none/undefined). */
  readonly enabled: boolean;
  /** The effort level, clamped to the model's `effortLevels`; present only for effort/adaptive modes. */
  readonly effort?: EffortLevel | undefined;
  /** The reasoning-token budget, clamped to `budgetRange`; present only for budget mode — DROPPED for
   *  adaptive (sending `enabled + budget_tokens` 400s an Opus-4.8-class model, providers.md Esoteric §8). */
  readonly budgetTokens?: number | undefined;
  /** The Anthropic reasoning-display knob, gated to the model's `displayModes`. */
  readonly display?: ReasoningDisplayMode | undefined;
}

/**
 * The capability-RESOLVED sampling knobs — each present only when the user SET it AND the model HONORS
 * it: numeric knobs are clamped to the descriptor range, boolean-gated knobs (seed/logitBias/stop)
 * survive only when the flag is set; an unsupported knob is dropped (and noted in {@link
 * ResolvedChatKnobs.warnings}). Field names mirror `UserIntent` so a runner spreads them onto its body.
 */
export interface ResolvedSampling {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly repetitionPenalty?: number | undefined;
  readonly seed?: number | undefined;
  readonly logitBias?: Record<string, number> | undefined;
  readonly stop?: readonly string[] | undefined;
}

/**
 * The full resolved chat decision both sealed runners consume. `maxOutputTokens` is clamped to the
 * model's `output.maxTokens` range; `warnings` are structured notes about dropped/ignored knobs (a
 * dispatch `code` + a human `message`, e.g. "temperature ignored: model does not expose a temperature
 * range").
 */
export interface ResolvedChatKnobs {
  readonly reasoning: ResolvedReasoning;
  readonly sampling: ResolvedSampling;
  readonly maxOutputTokens?: number | undefined;
  readonly warnings: readonly ResolvedWarning[];
}
