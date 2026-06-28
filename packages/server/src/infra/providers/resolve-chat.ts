// infra/providers/resolve-chat — THE ONE HOME for the `(UserIntent × ModelCapability) → resolved wire
// knobs` policy. Both sealed chat runners (agent-sdk + openrouter) call this ONCE per turn and consume
// the resolved decision, so the adaptive/budget guard, the effort-levels clamp, the display gate, the
// sampling capability-gating, and the output-cap clamp live HERE, once — never re-derived per backend
// (the divergence this slice kills: agent-sdk's translate clamped/gated everything while the OR runner
// only ran the adaptive guard and passed sampling through raw).
//
// It READS the injected `ModelCapability` descriptor (connection produced it); it NEVER authors it — no
// `ChatModel`/`FAMILY_CAPS`, no `resolveModelCapability` call (providers.md invariant #9). Pure +
// clock-free (deterministic): a projection of two inputs, no I/O, no ambient time/randomness.
//
// THE WIRE QUIRK IT ENCODES (providers.md Esoteric §8): an adaptive-reasoning model (Opus-4.8-class)
// 400s on `type:'enabled' + budget_tokens`, so for `mode === "adaptive"` the budget is DROPPED — effort
// only. The OR effort/max_tokens XOR is NOT here (that is a per-API wire SHAPE the kit owns); the runner
// still calls `backends/kit` for it. resolve-chat decides the on/off + depth; the kit shapes the wire.

import type { EffortLevel, ModelCapability, Range } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import type {
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
} from "./contract";

// `effort:"none"` is the user's "thinking off" sentinel (preset vocab) — distinct from the on/off axis
// (`reasoning.enabled`). It never reaches the resolved `effort` (which is gated capability vocab).
const EFFORT_OFF = "none";
// The adaptive guard note (Esoteric §8): an explicit budget on an adaptive model 400s the request.
const ADAPTIVE_BUDGET_WARNING =
  "reasoning budget ignored: adaptive model takes effort only (an explicit budget 400s the model)";

/** Clamp a user value into `[min, max]`. */
function clampRange(value: number, range: Range): number {
  return Math.min(Math.max(value, range.min), range.max);
}

/** A numeric sampling knob: undefined when the user didn't set it; clamped to the range when the model
 *  exposes one; DROPPED + warned when the model omits that range (no silent no-op). */
function resolveNumeric(
  label: string,
  value: number | undefined,
  range: Range | undefined,
  warnings: ResolvedWarning[],
): number | undefined {
  if (value === undefined) {
    return;
  }
  if (range === undefined) {
    warnings.push({
      code: "sampling_knob_dropped",
      message: `${label} ignored: model does not expose a ${label} range`,
    });
    return;
  }
  return clampRange(value, range);
}

/** A boolean-gated sampling knob (seed/logitBias/stop): kept only when the capability flag is set;
 *  DROPPED + warned otherwise. */
function resolveFlag<T>(
  label: string,
  value: T | undefined,
  supported: boolean | undefined,
  warnings: ResolvedWarning[],
): T | undefined {
  if (value === undefined) {
    return;
  }
  if (supported !== true) {
    warnings.push({
      code: "sampling_knob_dropped",
      message: `${label} ignored: model does not support ${label}`,
    });
    return;
  }
  return value;
}

/** The effort dial, clamped to the model's published `effortLevels` (dropped + warned when the model
 *  lists levels and the requested one isn't among them; passed through when the model lists none). The
 *  `none`/`undefined` cases are handled by `enabled` upstream, so they never reach here as a real level. */
function resolveEffort(
  effort: UserIntent["effort"],
  levels: readonly EffortLevel[] | undefined,
  warnings: ResolvedWarning[],
): EffortLevel | undefined {
  if (effort === undefined || effort === EFFORT_OFF) {
    return;
  }
  if (levels !== undefined && !levels.includes(effort)) {
    warnings.push({
      code: "effort_dropped",
      message: `effort "${effort}" ignored: model lists ${levels.join(", ")}`,
    });
    return;
  }
  return effort;
}

/** The reasoning-token budget for a budget-mode model: defaults to the model's max when the user picked
 *  no explicit depth (unifying the two runners — agent-sdk already did this; OR now matches), then
 *  clamps to the range. */
function resolveBudget(
  requested: number | undefined,
  range: Range | undefined,
): number | undefined {
  const value = requested ?? range?.max;
  if (value === undefined) {
    return;
  }
  return range === undefined ? value : clampRange(value, range);
}

/** The Anthropic reasoning-display knob, gated to the model's `displayModes` (dropped + warned when the
 *  model doesn't list the requested mode). */
function resolveDisplay(
  wanted: UserIntent["thinkingDisplay"],
  modes: ResolvedReasoning["display"][] | undefined,
  warnings: ResolvedWarning[],
): ResolvedReasoning["display"] {
  if (wanted === undefined) {
    return;
  }
  if (modes?.includes(wanted) !== true) {
    warnings.push({
      code: "display_dropped",
      message: `thinkingDisplay "${wanted}" ignored: model does not support it`,
    });
    return;
  }
  return wanted;
}

function resolveReasoning(
  params: UserIntent,
  capability: ModelCapability,
  warnings: ResolvedWarning[],
): ResolvedReasoning {
  const r = capability.reasoning;
  // The model must SUPPORT reasoning AND the user must have asked (a real effort, not none/undefined).
  const enabled = r.enabled && params.effort !== undefined && params.effort !== EFFORT_OFF;
  if (!enabled) {
    return { mode: r.mode, enabled: false };
  }
  const display = resolveDisplay(params.thinkingDisplay, r.displayModes, warnings);
  const displayPart = display !== undefined ? { display } : {};
  if (r.mode === "budget") {
    const budgetTokens = resolveBudget(params.thinkingBudgetTokens, r.budgetRange);
    return {
      mode: r.mode,
      enabled,
      ...(budgetTokens !== undefined ? { budgetTokens } : {}),
      ...displayPart,
    };
  }
  // effort + adaptive ride the effort dial; adaptive additionally DROPS any budget (the §8 guard).
  if (r.mode === "adaptive" && params.thinkingBudgetTokens !== undefined) {
    warnings.push({ code: "adaptive_budget_dropped", message: ADAPTIVE_BUDGET_WARNING });
  }
  const effort = resolveEffort(params.effort, r.effortLevels, warnings);
  return { mode: r.mode, enabled, ...(effort !== undefined ? { effort } : {}), ...displayPart };
}

function resolveSampling(
  params: UserIntent,
  capability: ModelCapability,
  warnings: ResolvedWarning[],
): ResolvedSampling {
  const s = capability.sampling;
  const temperature = resolveNumeric("temperature", params.temperature, s.temperature, warnings);
  const topP = resolveNumeric("topP", params.topP, s.topP, warnings);
  const topK = resolveNumeric("topK", params.topK, s.topK, warnings);
  const freq = resolveNumeric(
    "frequencyPenalty",
    params.frequencyPenalty,
    s.frequencyPenalty,
    warnings,
  );
  const pres = resolveNumeric(
    "presencePenalty",
    params.presencePenalty,
    s.presencePenalty,
    warnings,
  );
  const rep = resolveNumeric(
    "repetitionPenalty",
    params.repetitionPenalty,
    s.repetitionPenalty,
    warnings,
  );
  const seed = resolveFlag("seed", params.seed, s.seed, warnings);
  const logitBias = resolveFlag("logitBias", params.logitBias, s.logitBias, warnings);
  const stop = resolveFlag("stop", params.stop, s.stop, warnings);
  return {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(topK !== undefined ? { topK } : {}),
    ...(freq !== undefined ? { frequencyPenalty: freq } : {}),
    ...(pres !== undefined ? { presencePenalty: pres } : {}),
    ...(rep !== undefined ? { repetitionPenalty: rep } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(logitBias !== undefined ? { logitBias } : {}),
    ...(stop !== undefined ? { stop } : {}),
  };
}

/**
 * Project provider-agnostic `UserIntent` × the `ModelCapability` descriptor into the resolved wire knobs
 * both sealed chat runners consume. ALL the gating lives here: reasoning on/off + effort-clamp + the
 * adaptive/budget guard + the display gate, sampling capability-gating, and the output-cap clamp. The
 * per-backend WIRE mapping (kit `ReasoningRequest`/`ThinkingConfig`, the OR XOR) stays in the runners.
 */
export function resolveChat(params: UserIntent, capability: ModelCapability): ResolvedChatKnobs {
  const warnings: ResolvedWarning[] = [];
  const reasoning = resolveReasoning(params, capability, warnings);
  const sampling = resolveSampling(params, capability, warnings);
  const maxOutputTokens =
    params.maxOutputTokens !== undefined
      ? clampRange(params.maxOutputTokens, capability.output.maxTokens)
      : undefined;
  return {
    reasoning,
    sampling,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    warnings,
  };
}
