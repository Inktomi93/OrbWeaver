// The one home for the (UserIntent x ModelCapability) → resolved wire knobs policy. Both sealed chat
// runners call this once per turn: reasoning gating, the effort clamp, the adaptive/budget guard, sampling
// capability-gating, and the output-cap clamp all live here — never re-derived per backend. Pure + clock-free.

import type { EffortLevel, ModelCapability, Range, Verbosity } from "@orb/contracts/connection";
import { EFFORT_LEVELS } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { QUALITY_EFFORT, QUALITY_LEVELS, QUALITY_SAMPLING } from "@orb/contracts/preset";
import type { DynamicContextChannel, ResolvedChatKnobs, ResolvedReasoning, ResolvedSampling, ResolvedWarning } from "./contract/index.ts";

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

// Effort-default precedence (R0, documented): explicit user > quality-derived > the model's OWN advertised
// `defaultEffort` (OR) > house default (none). Quality never forces reasoning past what the model supports;
// the model default only fills the gap when the user picked neither an effort nor a quality.
function effectiveEffort(params: UserIntent, capability: ModelCapability): UserIntent["effort"] {
  if (params.effort !== undefined) {
    return params.effort;
  }
  if (params.quality !== undefined) {
    return QUALITY_EFFORT[params.quality];
  }
  // The model's own default effort fills the gap ONLY when it isn't off-by-default (defaultEnabled:false ⇒
  // reasoning stays off until the user asks — the historical behavior for every un-advertised model).
  return capability.reasoning.defaultEnabled === false ? undefined : capability.reasoning.defaultEffort;
}

// The lowest-effort member of the model's list, by the canonical `EFFORT_LEVELS` order (OR reports
// `supportedEfforts` HIGHEST-first, so array position ≠ severity). Falls back to the global minimum.
function lowestEffort(levels: readonly EffortLevel[] | undefined): EffortLevel {
  const pool = levels !== undefined && levels.length > 0 ? levels : EFFORT_LEVELS;
  return [...pool].sort((a, b) => EFFORT_LEVELS.indexOf(a) - EFFORT_LEVELS.indexOf(b))[0] ?? EFFORT_LEVELS[0];
}

// The quality dial's SAMPLING half — an explicit user knob wins; quality only FILLS the gap, and the value
// is still capability-gated + clamped downstream (resolveNumeric), so a model that omits the knob never
// receives it. Returns undefined when neither the user nor the (quality-mapped) default supplies the knob.
function effectiveSampling(explicit: number | undefined, quality: UserIntent["quality"], knob: keyof (typeof QUALITY_SAMPLING)["fast"]): number | undefined {
  if (explicit !== undefined) {
    return explicit;
  }
  return quality !== undefined ? QUALITY_SAMPLING[quality][knob] : undefined;
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

// The minimum visible/structured output the funnel keeps BELOW `maxOutputTokens` when a budget-mode
// reasoning budget is in scope. On Anthropic (agent-sdk `thinking.budget_tokens`) and OR-responses
// (`reasoning.max_tokens`) the reasoning budget is spent WITHIN the output cap, so `budget ≥ cap` leaves the
// visible payload zero room (a 400 on Anthropic, a truncated structured reply on OR). The default budget is
// `budgetRange.max` (32k) — far above a typical user output cap — so this headroom clamp is the common path.
const MIN_VISIBLE_OUTPUT_RESERVE = 512;

// Fit a budget-mode reasoning budget UNDER the resolved output cap, preserving the visible/structured
// payload. Only clamps DOWN (the user's explicit `maxOutputTokens` wins over the defaulted reasoning
// budget); a visible `reasoning_budget_clamped` warning, never a silent 400/truncation. `budgetRange.min`
// floors the clamp so a still-legal budget is emitted even when the cap is tight.
function clampBudgetToOutput(budgetTokens: number, maxOutputTokens: number | undefined, range: Range | undefined, warnings: ResolvedWarning[]): number {
  if (maxOutputTokens === undefined) {
    return budgetTokens;
  }
  const headroom = maxOutputTokens - MIN_VISIBLE_OUTPUT_RESERVE;
  if (budgetTokens <= headroom) {
    return budgetTokens;
  }
  const clamped = Math.max(range?.min ?? MIN_VISIBLE_OUTPUT_RESERVE, headroom);
  warnings.push({
    code: "reasoning_budget_clamped",
    message: `reasoning budget ${budgetTokens} exceeds the output cap ${maxOutputTokens}: clamped to ${clamped} to keep ~${MIN_VISIBLE_OUTPUT_RESERVE} tokens for the visible output`,
  });
  return clamped;
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

// Mandatory-reasoning clamp (R0/§(c)): a model whose descriptor says `mandatory` rejects `effort:'none'`
// at the wire (a live 400). When the intent resolves to none/absent, clamp UP to the lowest supported
// effort and emit the visible warning — honest degrade, never silent.
function clampMandatoryEffort(r: ModelCapability["reasoning"], effort: UserIntent["effort"], warnings: ResolvedWarning[]): UserIntent["effort"] {
  if (r.mandatory !== true || (effort !== undefined && effort !== EFFORT_OFF)) {
    return effort;
  }
  const lowest = lowestEffort(r.effortLevels);
  warnings.push({
    code: "reasoning_mandatory_clamp",
    message: `reasoning is mandatory on this model: clamped effort "${effort ?? "none"}" up to the lowest supported "${lowest}"`,
  });
  return lowest;
}

function resolveReasoning(
  params: UserIntent,
  capability: ModelCapability,
  maxOutputTokens: number | undefined,
  warnings: ResolvedWarning[],
): ResolvedReasoning {
  const r = capability.reasoning;
  const effort = clampMandatoryEffort(r, effectiveEffort(params, capability), warnings);
  const enabled = r.enabled && effort !== undefined && effort !== EFFORT_OFF;
  if (!enabled) {
    return { mode: r.mode, enabled: false };
  }
  const display = resolveDisplay(params.thinkingDisplay, r.displayModes, warnings);
  const displayPart = display !== undefined ? { display } : {};
  if (r.mode === "budget") {
    const rawBudget = resolveBudget(params.thinkingBudgetTokens, r.budgetRange);
    // The reasoning budget is spent within the output cap (Anthropic/OR-responses) — fit it under
    // maxOutputTokens so the visible/structured payload keeps headroom (never a silent 400/truncation).
    const budgetTokens = rawBudget !== undefined ? clampBudgetToOutput(rawBudget, maxOutputTokens, r.budgetRange, warnings) : undefined;
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

// `quality` is TYPED at every call site today, but the value itself originates in a persisted preset / the
// wire — an unrecognized string can only arrive that way, and `QUALITY_SAMPLING[quality][knob]` would then
// index `undefined` and throw a TypeError, taking the whole turn down over one bad data value. Total instead:
// an unknown quality resolves as NO quality dial (the user's explicit knobs and the model's own defaults still
// apply — exactly what an absent quality does) and says so in the existing drop vocabulary. Never throws.
function knownQuality(quality: UserIntent["quality"], warnings: ResolvedWarning[]): UserIntent["quality"] {
  if (quality !== undefined && !QUALITY_LEVELS.includes(quality)) {
    warnings.push({
      code: "sampling_knob_dropped",
      message: `quality "${quality}" ignored: not a known quality level (${QUALITY_LEVELS.join(", ")})`,
    });
    return;
  }
  return quality;
}

function resolveSampling(params: UserIntent, capability: ModelCapability, warnings: ResolvedWarning[]): ResolvedSampling {
  // The quality dial fills sampling gaps (QUALITY_SAMPLING); an explicit user knob still wins, and every
  // value is capability-gated + clamped below — a model whose descriptor omits the knob never receives it.
  const s = capability.sampling;
  const quality = knownQuality(params.quality, warnings);
  const temperature = resolveNumeric("temperature", effectiveSampling(params.temperature, quality, "temperature"), s.temperature, warnings);
  const topP = resolveNumeric("topP", params.topP, s.topP, warnings);
  const topK = resolveNumeric("topK", params.topK, s.topK, warnings);
  const freq = resolveNumeric("frequencyPenalty", params.frequencyPenalty, s.frequencyPenalty, warnings);
  const pres = resolveNumeric("presencePenalty", params.presencePenalty, s.presencePenalty, warnings);
  const rep = resolveNumeric("repetitionPenalty", params.repetitionPenalty, s.repetitionPenalty, warnings);
  const minP = resolveNumeric("minP", params.minP, s.minP, warnings);
  const topA = resolveNumeric("topA", params.topA, s.topA, warnings);
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
    ...(topA !== undefined ? { topA } : {}),
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
  // Resolve the output cap FIRST: the budget-mode reasoning clamp fits the reasoning budget under it.
  const maxOutputTokens = params.maxOutputTokens !== undefined ? clampRange(params.maxOutputTokens, capability.output.maxTokens) : undefined;
  const reasoning = resolveReasoning(params, capability, maxOutputTokens, warnings);
  const sampling = resolveSampling(params, capability, warnings);
  const dynamicContextChannel = resolveDynamicContext(params, capability, warnings);
  const verbosity = resolveVerbosity(params.verbosity, capability.verbosity, warnings);
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
