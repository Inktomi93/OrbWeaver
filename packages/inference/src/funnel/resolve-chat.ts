// The ONE home for the (UserIntent × GenerationCapability) → resolved wire knobs policy. Every chat backend
// calls this once per turn: reasoning gating, the effort clamp, the adaptive/budget guard, sampling
// capability-gating + the exclusive-pair drop, the output-cap clamp, the dynamic-context channel and the
// reply-images decision all live here — never re-derived per backend. Pure + clock-free. Its second consumer
// is `preset.resolveEffective` (the editor projects the very same call so the deck shows what the next turn
// will actually send). The anthropic-messages batch tasks (`summarize`/`structured`) take the reasoning half
// alone, through `resolveSideGenReasoning`, so a side-generation call obeys the same mandatory clamp a chat
// turn does.

import type { AdjustedKnob } from "@orb/contracts/chat";
import type { EffortLevel, GenerationCapability, Range, Verbosity } from "@orb/contracts/inference";
import { bindsThinkingToPrefix, EFFORT_LEVELS, reasoningReplayOf, survivesPrefixEdit } from "@orb/contracts/inference";
import type { CarryReasoning, UserIntent } from "@orb/contracts/preset";
import { CARRY_REASONING_DEFAULT, QUALITY_EFFORT, QUALITY_LEVELS, QUALITY_SAMPLING } from "@orb/contracts/preset";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedSampling, ResolvedWarning } from "../contract/resolve.ts";
import { ADAPTIVE_DEFAULT_EFFORT } from "../contract/resolve.ts";

const EFFORT_OFF = "none";
const ADAPTIVE_BUDGET_WARNING = "reasoning budget ignored: adaptive model takes effort only (an explicit budget 400s the model)";
const EFFORT_BUDGET_WARNING = "reasoning budget ignored: this model reasons by EFFORT LEVEL and exposes no token-budget field — set the effort dial instead";
const VERBOSITY_DROPPED_WARNING = "verbosity ignored: model does not expose a verbosity level";
const REPLY_MEDIA_DROPPED_WARNING = "reply pictures ignored: this model produces text only";
const CARRY_NEEDS_REASONING_WARNING = "carryReasoning ignored: reasoning is off for this turn, so there is no thinking to carry back";
const CARRY_UNSUPPORTED_WARNING = "carryReasoning ignored: this model does not accept its own prior thinking back (capability.reasoning.replay: none)";
const CARRY_PREFIX_WARNING =
  "carryReasoning conversation ran as tool-chain: this model binds thinking to its prefix and this route cannot keep a prefix edit from failing the turn (capability.reasoning.prefixEditSafe)";

function clampRange(value: number, range: Range): number {
  return Math.min(Math.max(value, range.min), range.max);
}

// Module-level state is fine here — an observability id, not a determinism-sensitive value.
let turnCounter = 0;
function mintTurnId(): string {
  turnCounter += 1;
  return `turn_${turnCounter}`;
}

function resolveNumeric(label: AdjustedKnob, value: number | undefined, range: Range | undefined, warnings: ResolvedWarning[]): number | undefined {
  if (value === undefined) {
    return;
  }
  if (range === undefined) {
    warnings.push({ code: "sampling_knob_dropped", knob: label, message: `${label} ignored: model does not expose a ${label} range` });
    return;
  }
  return clampRange(value, range);
}

function resolveFlag<T>(label: AdjustedKnob, value: T | undefined, supported: boolean | undefined, warnings: ResolvedWarning[]): T | undefined {
  if (value === undefined) {
    return;
  }
  if (supported !== true) {
    warnings.push({ code: "sampling_knob_dropped", knob: label, message: `${label} ignored: model does not support ${label}` });
    return;
  }
  return value;
}

// Effort-default precedence: explicit user > quality-derived > the house default for a model that supports
// adaptive thinking > the catalog-advertised default for any other model (OpenAI/Gemini reasoning on OpenRouter)
// > none. The house default keys on the adaptive capability alone, never on a model family, so it is the same on
// every route; the advertised default never fills an off-by-default model.
function effectiveEffort(params: UserIntent, capability: GenerationCapability): UserIntent["effort"] {
  if (params.effort !== undefined) {
    return params.effort;
  }
  if (params.quality !== undefined) {
    return QUALITY_EFFORT[params.quality];
  }
  const r = capability.reasoning;
  if (r.mode === "adaptive") {
    return ADAPTIVE_DEFAULT_EFFORT;
  }
  return r.defaultEnabled === false ? undefined : r.defaultEffort;
}

// The lowest-effort member of the model's list by the canonical `EFFORT_LEVELS` order (OR reports
// `supportedEfforts` HIGHEST-first, so array position ≠ severity).
function lowestEffort(levels: readonly EffortLevel[] | undefined): EffortLevel {
  const pool = levels !== undefined && levels.length > 0 ? levels : EFFORT_LEVELS;
  return pool.toSorted((a, b) => EFFORT_LEVELS.indexOf(a) - EFFORT_LEVELS.indexOf(b))[0] ?? EFFORT_LEVELS[0];
}

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
    warnings.push({ code: "effort_dropped", message: `effort "${effort}" ignored: model lists ${levels.join(", ")}` });
    return;
  }
  return effort;
}

/** The budget an effort level asks for when the caller set none: a geometric step through the model's range by
 *  the level's place in `EFFORT_LEVELS`, so each level roughly doubles the one below and `max` is the range top.
 *  A linear step would still hand `low` a third of a 63k range; geometric keeps the low levels near the floor. */
function budgetForEffort(effort: UserIntent["effort"], range: Range): number {
  const index = effort === undefined || effort === EFFORT_OFF ? EFFORT_LEVELS.length - 1 : EFFORT_LEVELS.indexOf(effort);
  const fraction = (index + 1) / EFFORT_LEVELS.length;
  return Math.round(range.min * (range.max / range.min) ** fraction);
}

function resolveBudget(requested: number | undefined, range: Range | undefined, effort: UserIntent["effort"]): number | undefined {
  if (range === undefined) {
    return requested;
  }
  return clampRange(requested ?? budgetForEffort(effort, range), range);
}

// The minimum visible/structured output kept BELOW `maxOutputTokens` when a budget-mode reasoning budget
// is in scope: on Anthropic / OR-responses the budget is spent WITHIN the output cap.
const MIN_VISIBLE_OUTPUT_RESERVE = 512;

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
    appliedBudget: clamped,
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
    warnings.push({ code: "display_dropped", message: `thinkingDisplay "${wanted}" ignored: model does not support it` });
    return;
  }
  return wanted;
}

/** THE ADAPTIVE DISPLAY DEFAULT (§B4). MEASURED 2026-09-19 on the direct wire: `claude-opus-5` with
 *  `thinking: {type:"adaptive"}` and NO `display` streams ZERO reasoning characters while still billing
 *  reasoning tokens; the same call with `display: "summarized"` streams 67. Absent is therefore not "the
 *  model's choice", it is "no trace at all" — so an adaptive model that ADVERTISES the summarized mode gets
 *  it unless the user picked something else. Budget/effort modes are untouched (the knob is Anthropic's
 *  adaptive-thinking control), and it is inert on the openrouter route: that transport spells no display,
 *  and OR sets `display: summarized` upstream by itself (measured via `debug.echo_upstream_body`). */
const DEFAULT_ADAPTIVE_DISPLAY = "summarized";

function defaultDisplay(r: GenerationCapability["reasoning"]): ResolvedReasoning["display"] {
  return r.mode === "adaptive" && r.displayModes?.includes(DEFAULT_ADAPTIVE_DISPLAY) === true ? DEFAULT_ADAPTIVE_DISPLAY : undefined;
}

// Mandatory-reasoning clamp: a model whose descriptor says `mandatory` rejects `effort:'none'` at the wire, so a
// CHOSEN off clamps up. An unset effort is left unset: the wire then sends no field and the model uses its default.
function clampMandatoryEffort(r: GenerationCapability["reasoning"], effort: UserIntent["effort"], warnings: ResolvedWarning[]): UserIntent["effort"] {
  if (r.mandatory !== true || effort !== EFFORT_OFF) {
    return effort;
  }
  const lowest = lowestEffort(r.effortLevels);
  warnings.push({
    appliedEffort: lowest,
    code: "reasoning_mandatory_clamp",
    message: `reasoning is mandatory on this model: clamped effort "${effort}" up to the lowest supported "${lowest}"`,
  });
  return lowest;
}

/** THE ON/OFF DECISION, before any budget/display/effort spelling, over the effort that survived the mandatory
 *  clamp. Two facts, one derivation, so the halves that read them cannot drift:
 *   - `enabled`: the wire spells reasoning ON at a level (an effort resolved). Unset is not enabled: the wire
 *     then sends no reasoning field.
 *   - `on`: reasoning RUNS this turn — THE one home for that question (§8.8's carry coherence rule reads it).
 *     The model can reason and the caller did not choose off; an unset effort runs at the model's own default,
 *     which is on unless the model advertises reasoning off by default.
 *  The clamp's warning goes to the caller's sink, so the funnel emits it once (from {@link resolveReasoning})
 *  and the carry-only reader passes a throwaway. */
function reasoningEnabledFor(
  params: UserIntent,
  capability: GenerationCapability,
  warnings: ResolvedWarning[],
): { enabled: boolean; on: boolean; effort: UserIntent["effort"] } {
  const r = capability.reasoning;
  const effort = clampMandatoryEffort(r, effectiveEffort(params, capability), warnings);
  const defaultOff = effort === undefined && r.mandatory !== true && r.defaultEnabled === false;
  return { enabled: r.enabled && effort !== undefined && effort !== EFFORT_OFF, on: r.enabled && effort !== EFFORT_OFF && !defaultOff, effort };
}

/** THE CARRY RESOLUTION (§8.8) — the ONE home for "how much of the model's own prior thinking rides back".
 *  Read by the funnel (which folds the drop warning onto the turn) AND, with a throwaway sink, by the chat
 *  engine, which must know the rung BEFORE the first leg: the `conversation` materialization happens at the
 *  history-build seam, upstream of any wire call.
 *
 *  Two gates, both dropping to `off` with the ordinary `sampling_knob_dropped` warning rather than greying a
 *  control the user cannot reason about (§8.7-3):
 *   1. COHERENCE (from ST, kept): carry above `off` requires reasoning to be ON for this turn — a carry knob on
 *      a non-reasoning turn has nothing to carry. An unset effort is on at the model's own default.
 *   2. CAPABILITY: `reasoning.replay: "none"` means the wire refuses replayed thinking outright.
 *  Then one clamp, with `carry_reasoning_downgraded`: `conversation` on a prefix-bound model runs as `tool-chain`
 *  on a route where a prefix edit could fail the turn. Inside one turn's tool loop the prefix does not change.
 *  The `text` rung needs no arm here: the parts carry their prose either way, and a wire that round-trips no
 *  provenance simply receives a part whose `meta` its converter ignores. */
export function resolveCarryReasoning(params: UserIntent, capability: GenerationCapability, warnings: ResolvedWarning[]): CarryReasoning {
  const wanted = params.carryReasoning ?? CARRY_REASONING_DEFAULT;
  if (wanted === "off") {
    return "off";
  }
  if (!reasoningEnabledFor(params, capability, []).on) {
    warnings.push({ code: "sampling_knob_dropped", knob: "carryReasoning", message: CARRY_NEEDS_REASONING_WARNING });
    return "off";
  }
  if (reasoningReplayOf(capability) === "none") {
    warnings.push({ code: "sampling_knob_dropped", knob: "carryReasoning", message: CARRY_UNSUPPORTED_WARNING });
    return "off";
  }
  if (wanted === "conversation" && bindsThinkingToPrefix(capability) && !survivesPrefixEdit(capability)) {
    warnings.push({ code: "carry_reasoning_downgraded", knob: "carryReasoning", message: CARRY_PREFIX_WARNING });
    return "tool-chain";
  }
  return wanted;
}

/** THE SIDE-GENERATION REASONING POSTURE (#2575) — what a `summarize` / `structured` call runs. The posture is
 *  "reasoning OFF" (a summary is not worth thinking tokens), resolved through the SAME on/off decision and
 *  mandatory clamp a chat turn takes, never spelled `disabled` straight at the wire: a model whose reasoning is
 *  mandatory (Fable, Opus 5.5) 400s that, so it runs at its LOWEST effort with `reasoning_mandatory_clamp`.
 *  No display is resolved — a batch reads only the reply text. */
export function resolveSideGenReasoning(capability: GenerationCapability, warnings: ResolvedWarning[]): ResolvedReasoning {
  const r = capability.reasoning;
  const { enabled, effort } = reasoningEnabledFor({ effort: EFFORT_OFF }, capability, warnings);
  if (!enabled) {
    return { mode: r.mode, enabled: false };
  }
  const resolvedEffort = resolveEffort(effort, r.effortLevels, warnings);
  return { mode: r.mode, enabled, ...(resolvedEffort !== undefined ? { effort: resolvedEffort } : {}) };
}

function resolveReasoning(
  params: UserIntent,
  capability: GenerationCapability,
  maxOutputTokens: number | undefined,
  warnings: ResolvedWarning[],
): ResolvedReasoning {
  const r = capability.reasoning;
  const { enabled, effort } = reasoningEnabledFor(params, capability, warnings);
  if (!enabled) {
    return { mode: r.mode, enabled: false, ...(effort === EFFORT_OFF && r.enabled ? { offChosen: true } : {}) };
  }
  const display = resolveDisplay(params.thinkingDisplay, r.displayModes, warnings) ?? defaultDisplay(r);
  const displayPart = display !== undefined ? { display } : {};
  if (r.mode === "budget") {
    const rawBudget = resolveBudget(params.thinkingBudgetTokens, r.budgetRange, effort);
    const budgetTokens = rawBudget !== undefined ? clampBudgetToOutput(rawBudget, maxOutputTokens, r.budgetRange, warnings) : undefined;
    return { mode: r.mode, enabled, ...(budgetTokens !== undefined ? { budgetTokens } : {}), ...displayPart };
  }
  // D41: every budget-less mode drops a budget LOUDLY, adaptive and effort alike.
  if (params.thinkingBudgetTokens !== undefined) {
    warnings.push(
      r.mode === "adaptive"
        ? { code: "adaptive_budget_dropped", message: ADAPTIVE_BUDGET_WARNING }
        : { code: "sampling_knob_dropped", knob: "thinkingBudgetTokens", message: EFFORT_BUDGET_WARNING },
    );
  }
  const resolvedEffort = resolveEffort(effort, r.effortLevels, warnings);
  return { mode: r.mode, enabled, ...(resolvedEffort !== undefined ? { effort: resolvedEffort } : {}), ...displayPart };
}

// A persisted preset can carry an unknown quality; total instead of a TypeError on the whole turn.
function knownQuality(quality: UserIntent["quality"], warnings: ResolvedWarning[]): UserIntent["quality"] {
  if (quality !== undefined && !QUALITY_LEVELS.includes(quality)) {
    warnings.push({
      code: "sampling_knob_dropped",
      knob: "quality",
      message: `quality "${quality}" ignored: not a known quality level (${QUALITY_LEVELS.join(", ")})`,
    });
    return;
  }
  return quality;
}

/** The exclusive-pair rule (§8.7): for each declared pair, when BOTH resolved, keep the first-listed and
 *  drop the other with `sampling_knob_conflict`. Runs AFTER gating so a knob the model never exposed is
 *  not "in conflict" with anything. */
function dropExclusive(sampling: ResolvedSampling, pairs: readonly (readonly [string, string])[] | undefined, warnings: ResolvedWarning[]): ResolvedSampling {
  if (pairs === undefined || pairs.length === 0) {
    return sampling;
  }
  const out: Record<string, unknown> = { ...sampling };
  for (const [keep, drop] of pairs) {
    if (out[keep] !== undefined && out[drop] !== undefined) {
      delete out[drop];
      warnings.push({
        code: "sampling_knob_conflict",
        knob: drop as AdjustedKnob,
        message: `${drop} ignored: this model rejects ${keep} and ${drop} together — ${keep} kept`,
      });
    }
  }
  return out as ResolvedSampling;
}

function resolveSampling(params: UserIntent, capability: GenerationCapability, warnings: ResolvedWarning[]): ResolvedSampling {
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
  const gated: ResolvedSampling = {
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
  return dropExclusive(gated, s.exclusive, warnings);
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

/** `modalities: ["text","image"]` rides the wire only when the preset asks AND the model produces images
 *  (§6.7); a knob on a text-only model drops like every other unsupported knob. */
function resolveReplyImages(params: UserIntent, capability: GenerationCapability, warnings: ResolvedWarning[]): boolean {
  if (params.replyMedia !== "text+image") {
    return false;
  }
  if (!capability.output.modalities.includes("image")) {
    warnings.push({ code: "sampling_knob_dropped", knob: "replyMedia", message: REPLY_MEDIA_DROPPED_WARNING });
    return false;
  }
  return true;
}

export function resolveChat(params: UserIntent, capability: GenerationCapability): ResolvedChatKnobs {
  const warnings: ResolvedWarning[] = [];
  // Resolve the output cap FIRST: the budget-mode reasoning clamp fits the reasoning budget under it.
  const maxOutputTokens = params.maxOutputTokens !== undefined ? clampRange(params.maxOutputTokens, capability.output.maxTokens) : undefined;
  const reasoning = resolveReasoning(params, capability, maxOutputTokens, warnings);
  const sampling = resolveSampling(params, capability, warnings);
  const verbosity = resolveVerbosity(params.verbosity, capability.verbosity, warnings);
  const replyImages = resolveReplyImages(params, capability, warnings);
  const carryReasoning = resolveCarryReasoning(params, capability, warnings);
  return {
    turnId: mintTurnId(),
    reasoning,
    carryReasoning,
    sampling,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(verbosity !== undefined ? { verbosity } : {}),
    replyImages,
    warnings,
  };
}
