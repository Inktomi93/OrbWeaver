// infra/providers/backends/kit/reasoning-budget — the OpenAI/OpenRouter `reasoning` wire-block builders.
// A pure projection of an already-decided reasoning state (the resolver decided on/off + the depth knobs)
// into the per-API wire shape, enforcing the OR-responses XOR.
//
// DECOUPLED FROM resolve-chat (intentional): neo's versions read a `ResolvedChat`. Orbweaver has no
// `ResolvedChat` type yet (resolve-chat is a separate infra slice), and a pure wire helper must not depend
// on it. These take a minimal {@link ReasoningRequest} the funnel/runner fills in — the funnel collapses
// adaptive→effort BEFORE calling, so this module only maps + enforces the wire constraints.
//
// WIRE CONSTRAINT (Esoteric §8, caught live 2026-06-03): OR responses 400s when BOTH `reasoning.effort`
// AND `reasoning.max_tokens` are present. `effortToResponsesReasoning` emits exactly ONE — budget wins
// when explicit (the user picked an exact depth), effort otherwise.

import type { EffortLevel } from "@orb/contracts/preset";

// OpenAI + OpenRouter share this `reasoning.effort` vocab on their reasoning models. Levels match OR's
// published `ReasoningEffort` enum; our internal `max` maps to `xhigh` (OR has no `max`). Consumers derive
// the union from this tuple — `(typeof OPENAI_EFFORT_LEVELS)[number]` — rather than re-spelling it (§1).
export const OPENAI_EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

// File-local: the wire-effort union. Not exported as a `type` (no-inline-types — consumers derive from the
// tuple above or read it structurally off the returned blocks).
type OpenAIReasoningEffort = (typeof OPENAI_EFFORT_LEVELS)[number];

// The neutral default when reasoning is on but no explicit level/budget was chosen.
const DEFAULT_WIRE_EFFORT: OpenAIReasoningEffort = "high";
// The off-switch value (the wire's way to say "no reasoning this turn").
const REASONING_OFF: OpenAIReasoningEffort = "none";

/** The already-resolved reasoning state a runner projects to the wire. `enabled` is the on/off decision
 *  (NOT `effort:'none'`); `effort` is the user/resolver-chosen level (preset vocab, may be `max`);
 *  `budgetTokens` is an explicit reasoning-token budget when one is in scope. */
export interface ReasoningRequest {
  readonly enabled: boolean;
  readonly effort?: EffortLevel | undefined;
  readonly budgetTokens?: number | undefined;
}

/** The OR chat-completions `reasoning` block — effort only (chat-completions reasoning accepts no budget). */
export interface ChatCompletionsReasoning {
  readonly effort: OpenAIReasoningEffort;
}

/** The OR responses `reasoning` block — the FULL shape, but with the effort/maxTokens XOR enforced: at
 *  most one of `effort`/`maxTokens` is ever present. */
export interface ResponsesReasoning {
  readonly effort?: OpenAIReasoningEffort;
  readonly maxTokens?: number;
  readonly enabled?: boolean;
}

/** Map our internal effort level → the OR/OpenAI wire vocab. `max` → `xhigh`; every other level is already
 *  a wire level (preset `EffortLevel` minus `max` === {@link OPENAI_EFFORT_LEVELS}). `undefined` in →
 *  `undefined` out so the caller can fall back to a default. */
function effortLevelToWire(effort: EffortLevel | undefined): OpenAIReasoningEffort | undefined {
  if (effort === undefined) {
    return;
  }
  if (effort === "max") {
    return "xhigh";
  }
  return effort;
}

/** Build the OR chat-completions `reasoning` block. Off → `{ effort: "none" }`; on → the chosen wire
 *  effort, defaulting to `high` when no level was picked. */
export function effortToOpenAIReasoning(req: ReasoningRequest): ChatCompletionsReasoning {
  if (!req.enabled) {
    return { effort: REASONING_OFF };
  }
  return { effort: effortLevelToWire(req.effort) ?? DEFAULT_WIRE_EFFORT };
}

/** Build the OR responses `reasoning` block, enforcing the effort/maxTokens XOR. Off →
 *  `{ effort:"none", enabled:false }`; an explicit budget → `{ maxTokens }` ONLY (budget is the more
 *  specific signal, and OR 400s on both fields); otherwise the effort dial (same shape as
 *  chat-completions). The return NEVER carries both `effort` and `maxTokens`. */
export function effortToResponsesReasoning(req: ReasoningRequest): ResponsesReasoning {
  if (!req.enabled) {
    return { effort: REASONING_OFF, enabled: false };
  }
  if (req.budgetTokens !== undefined) {
    return { maxTokens: req.budgetTokens };
  }
  return effortToOpenAIReasoning(req);
}
