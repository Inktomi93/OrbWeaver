// The one home for the (UserIntent x ModelCapability) → resolved wire knobs policy. Both sealed chat
// runners call this once per turn: reasoning gating, the effort clamp, the adaptive/budget guard, sampling
// capability-gating, and the output-cap clamp all live here — never re-derived per backend. Pure + clock-free.

import type { EffortLevel, ModelCapability, Range, Verbosity } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { QUALITY_EFFORT } from "@orb/contracts/preset";
import type { DynamicContextChannel, ResolvedChatKnobs, ResolvedReasoning, ResolvedSampling, ResolvedWarning } from "./contract";

const EFFORT_OFF = "none";
const ADAPTIVE_BUDGET_WARNING = "reasoning budget ignored: adaptive model takes effort only (an explicit budget 400s the model)";
const DYNAMIC_CONTEXT_DEMOTED_WARNING = "dynamic context 'hook' ignored: model does not honor a mid-conversation system channel — using the system block";
const VERBOSITY_DROPPED_WARNING = "verbosity ignored: model does not expose a verbosity level";

function clampRange(value: number, range: Range): number {
  return Math.min(Math.max(value, range.min), range.max);
}

// Module-level state is fine here — an observability id, not a determinism-sensitive value.
let turnCounter = 0;
function mintTurnId(): string {
  turnCounter += 1;
  return `turn_${turnCounter}`;
}

function resolveNumeric(label: string, value: number | undefined, range: Range | undefined, warnings: ResolvedWarning[]): number | undefined {
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

function resolveFlag<T>(label: string, value: T | undefined, supported: boolean | undefined, warnings: ResolvedWarning[]): T | undefined {
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

// Explicit effort wins over the quality dial's mapped default — quality never forces reasoning past what the model supports.
function effectiveEffort(params: UserIntent): UserIntent["effort"] {
  if (params.effort !== undefined) {
    return params.effort;
  }
  return params.quality !== undefined ? QUALITY_EFFORT[params.quality] : undefined;
}

function resolveEffort(effort: UserIntent["effort"], levels: readonly EffortLevel[] | undefined, warnings: ResolvedWarning[]): EffortLevel | undefined {
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

function resolveBudget(requested: number | undefined, range: Range | undefined): number | undefined {
  const value = requested ?? range?.max;
  if (value === undefined) {
    return;
  }
  return range === undefined ? value : clampRange(value, range);
}

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

function resolveReasoning(params: UserIntent, capability: ModelCapability, warnings: ResolvedWarning[]): ResolvedReasoning {
  const r = capability.reasoning;
  const effort = effectiveEffort(params);
  const enabled = r.enabled && effort !== undefined && effort !== EFFORT_OFF;
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
  if (r.mode === "adaptive" && params.thinkingBudgetTokens !== undefined) {
    warnings.push({ code: "adaptive_budget_dropped", message: ADAPTIVE_BUDGET_WARNING });
  }
  const resolvedEffort = resolveEffort(effort, r.effortLevels, warnings);
  return {
    mode: r.mode,
    enabled,
    ...(resolvedEffort !== undefined ? { effort: resolvedEffort } : {}),
    ...displayPart,
  };
}

function resolveSampling(params: UserIntent, capability: ModelCapability, warnings: ResolvedWarning[]): ResolvedSampling {
  // DEFER(quality-sampling): quality maps only to the reasoning axis today; per-model quality→sampling
  // numbers are pending live tuning, so sampling reads only the user's own knobs until then.
  const s = capability.sampling;
  const temperature = resolveNumeric("temperature", params.temperature, s.temperature, warnings);
  const topP = resolveNumeric("topP", params.topP, s.topP, warnings);
  const topK = resolveNumeric("topK", params.topK, s.topK, warnings);
  const freq = resolveNumeric("frequencyPenalty", params.frequencyPenalty, s.frequencyPenalty, warnings);
  const pres = resolveNumeric("presencePenalty", params.presencePenalty, s.presencePenalty, warnings);
  const rep = resolveNumeric("repetitionPenalty", params.repetitionPenalty, s.repetitionPenalty, warnings);
  const minP = resolveNumeric("minP", params.minP, s.minP, warnings);
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
    ...(minP !== undefined ? { minP } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(logitBias !== undefined ? { logitBias } : {}),
    ...(stop !== undefined ? { stop } : {}),
  };
}

function resolveVerbosity(wanted: UserIntent["verbosity"], levels: readonly Verbosity[] | undefined, warnings: ResolvedWarning[]): Verbosity | undefined {
  if (wanted === undefined) {
    return;
  }
  if (levels?.includes(wanted) !== true) {
    warnings.push({ code: "verbosity_dropped", message: VERBOSITY_DROPPED_WARNING });
    return;
  }
  return wanted;
}

export function resolveDynamicContext(params: UserIntent, capability: ModelCapability, warnings: ResolvedWarning[]): DynamicContextChannel {
  const midConvCapable = capability.turns?.midConversationSystem ?? false;
  const knob = params.advanced?.dynamicContext;
  if (knob === "system") {
    return "system-block";
  }
  if (knob === "hook") {
    if (midConvCapable) {
      return "message-tail";
    }
    warnings.push({ code: "dynamic_context_demoted", message: DYNAMIC_CONTEXT_DEMOTED_WARNING });
    return "system-block";
  }
  return midConvCapable ? "message-tail" : "system-block";
}

export function resolveChat(params: UserIntent, capability: ModelCapability): ResolvedChatKnobs {
  const warnings: ResolvedWarning[] = [];
  const reasoning = resolveReasoning(params, capability, warnings);
  const sampling = resolveSampling(params, capability, warnings);
  const dynamicContextChannel = resolveDynamicContext(params, capability, warnings);
  const verbosity = resolveVerbosity(params.verbosity, capability.verbosity, warnings);
  const maxOutputTokens = params.maxOutputTokens !== undefined ? clampRange(params.maxOutputTokens, capability.output.maxTokens) : undefined;
  return {
    turnId: mintTurnId(),
    reasoning,
    sampling,
    dynamicContextChannel,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(verbosity !== undefined ? { verbosity } : {}),
    warnings,
  };
}
