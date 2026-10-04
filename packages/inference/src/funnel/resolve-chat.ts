// The ONE home for the (UserIntent × GenerationCapability) → resolved wire knobs policy. Every chat backend
// calls this once per turn: reasoning gating, the effort clamp, the adaptive/budget guard, sampling
// capability-gating + the exclusive-pair drop, the output-cap clamp, the dynamic-context channel and the
// reply-images decision all live here — never re-derived per backend. Pure + clock-free. Its second consumer
// is `preset.resolveEffective` (the editor projects the very same call so the deck shows what the next turn
// will actually send). The anthropic-messages batch tasks (`summarize`/`structured`) take the reasoning half
// alone, through `resolveSideGenReasoning`, so a side-generation call obeys the same mandatory clamp a chat
// turn does.

import type { AdjustedKnob } from "@orb/contracts/chat";
import type { EffortLevel, GenerationCapability, Range, SamplerStage, SamplingRangeKnob, Verbosity, Wire } from "@orb/contracts/inference";
import {
  bindsThinkingToPrefix,
  completeSamplerOrder,
  EFFORT_LEVELS,
  reasoningOffModeOf,
  reasoningReplayOf,
  SAMPLER_KNOB_STAGES,
  SAMPLING_RANGE_KNOBS,
  survivesPrefixEdit,
} from "@orb/contracts/inference";
import type { CarryReasoning, UserIntent } from "@orb/contracts/preset";
import { CARRY_REASONING_DEFAULT, QUALITY_EFFORT, QUALITY_LEVELS, QUALITY_SAMPLING } from "@orb/contracts/preset";
import type { ResolvedChatKnobs, ResolvedReasoning, ResolvedSampling, ResolvedWarning } from "../contract/resolve.ts";
import { ADAPTIVE_DEFAULT_EFFORT } from "../contract/resolve.ts";
import type { TaskSampling } from "../contract/roles.ts";
import type { SideGenReasoning } from "../contract/side-gen.ts";

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
    const listed = levels.length === 0 ? "this model's thinking is on or off, at no level" : `model lists ${levels.join(", ")}`;
    warnings.push({ code: "effort_dropped", message: `effort "${effort}" ignored: ${listed}` });
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
  // A model whose thinking is on or off at no level has no level to clamp to: the off is not sent, so it thinks as it
  // always does.
  if (r.effortLevels?.length === 0) {
    warnings.push({ code: "reasoning_mandatory_clamp", message: `reasoning is mandatory on this model: effort "${effort}" ignored, it thinks by default` });
    return;
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

/** THE TEMPLATE THINKING STATE — what a chat template's own thinking switch is told this turn, on a row that
 *  has one (`features.thinkingOff`: the template kwargs, or the effort field's off word). `true`/`false` when the
 *  preset chose (after the mandatory clamp); with the preset unset, `false` on a turn that attaches terminal
 *  tools, because a folded turn needs prose and state in one completion and a template that thinks answers with
 *  the calls alone, unless the model's reasoning is mandatory, which is never told off; otherwise `undefined`,
 *  and the server's own default stands as it always has. */
export function templateThinkingFor(params: UserIntent, capability: GenerationCapability, terminalToolsAttached: boolean): boolean | undefined {
  const presetChose = params.effort !== undefined || params.quality !== undefined || params.thinkingBudgetTokens !== undefined;
  if (presetChose) {
    const { enabled, effort } = reasoningEnabledFor(params, capability, []);
    if (enabled) {
      return true;
    }
    if (effort === EFFORT_OFF) {
      return false;
    }
  }
  return terminalToolsAttached && capability.reasoning.mandatory !== true ? false : undefined;
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

/** THE SIDE-GENERATION REASONING — what a `summarize` / `structured` call runs. When the role's preset sets
 *  effort or a thinking budget (D299), those govern; a budget alone turns reasoning on at that budget. Otherwise
 *  the posture is "reasoning OFF" (a summary is not worth thinking tokens). Both resolve through the SAME on/off decision and mandatory clamp a chat turn takes,
 *  never spelled `disabled` straight at the wire: a model whose reasoning is mandatory (Fable, Opus 5.5) 400s
 *  that, so it runs at its minimum effort or budget with `reasoning_mandatory_clamp`. No display is resolved —
 *  a batch reads only the reply text. An explicit `none` (a posture's floor) is the same off.
 *
 *  Reasoning that runs is paid out of the output cap on every wire this serves, so the cap grows by the room the
 *  thinking may take ({@link sideGenOutputCap}); a cap sized for the answer alone ends in an empty reply. A wire
 *  whose SDK already adds the budget to the cap gets the visible cap as-is on the budget arm. */
export function resolveSideGenReasoning(
  capability: GenerationCapability,
  wire: Wire,
  warnings: ResolvedWarning[],
  wanted: Pick<TaskSampling, "effort" | "thinkingBudgetTokens" | "maxTokens">,
): SideGenReasoning {
  const r = capability.reasoning;
  const presetGoverns = (wanted.effort !== undefined && wanted.effort !== EFFORT_OFF) || wanted.thinkingBudgetTokens !== undefined;
  const params: UserIntent = presetGoverns
    ? presetReasoningIntent(capability, wanted, warnings)
    : {
        effort: EFFORT_OFF,
        ...(r.mode === "budget" && r.mandatory === true && r.budgetRange !== undefined ? { thinkingBudgetTokens: r.budgetRange.min } : {}),
      };
  // A budget may take what the model's own cap leaves beside the visible answer.
  const room = capability.output.maxTokens.max - (wanted.maxTokens ?? 0);
  const { display: _display, ...reasoning } = resolveReasoning(params, capability, room, warnings);
  const budgetAddedByWire = reasoning.enabled && reasoning.mode === "budget" && WIRES_ADDING_THINKING_BUDGET.has(wire);
  return { reasoning, maxTokens: budgetAddedByWire ? wanted.maxTokens : sideGenOutputCap(capability, reasoning, wanted.maxTokens) };
}

// The thinking room for an effort level on a model that states no budget range: Anthropic's documented budget
// range, which the effort ladder maps onto the same way a budget model's own range does.
const REASONING_ALLOWANCE_RANGE: Range = { min: 1024, max: 32_000 };
// An effort-mode model that names no default effort reasons at a level the wire does not say: size for high.
const UNSTATED_ALLOWANCE_EFFORT: EffortLevel = "high";

// Wires whose SDK grows the output cap by the thinking budget itself: @ai-sdk/anthropic sends
// `max_tokens = maxOutputTokens + budget_tokens` on `thinking.type: "enabled"`, so the funnel must not add it too.
const WIRES_ADDING_THINKING_BUDGET: ReadonlySet<Wire> = new Set<Wire>(["anthropic-messages"]);

// The lowest effort level whose share of `range` covers `budget`, so the room an effort wire leaves is never
// smaller than the budget the user asked for; the model's top level when none does.
function effortForBudget(budget: number, levels: readonly EffortLevel[] | undefined, range: Range): EffortLevel {
  const pool = (levels !== undefined && levels.length > 0 ? levels : EFFORT_LEVELS).toSorted((a, b) => EFFORT_LEVELS.indexOf(a) - EFFORT_LEVELS.indexOf(b));
  return pool.find((level) => budgetForEffort(level, range) >= budget) ?? pool.at(-1) ?? EFFORT_LEVELS[0];
}

// A preset's own reasoning choice. A budget with no effort is a choice to reason at that budget: a budget-mode
// model runs it as given; a model that reasons by effort runs the level that covers it, and says so.
function presetReasoningIntent(
  capability: GenerationCapability,
  wanted: Pick<TaskSampling, "effort" | "thinkingBudgetTokens">,
  warnings: ResolvedWarning[],
): UserIntent {
  const { effort, thinkingBudgetTokens: budget } = wanted;
  if (effort !== undefined || budget === undefined) {
    return { ...(effort !== undefined ? { effort } : {}), ...(budget !== undefined ? { thinkingBudgetTokens: budget } : {}) };
  }
  const r = capability.reasoning;
  const level = effortForBudget(budget, r.effortLevels, r.budgetRange ?? REASONING_ALLOWANCE_RANGE);
  if (r.mode === "budget") {
    return { effort: level, thinkingBudgetTokens: budget };
  }
  if (r.enabled) {
    const message = `reasoning budget ${budget} ran as effort "${level}": this model reasons by effort level and takes no token budget`;
    warnings.push(
      r.mode === "adaptive" ? { code: "adaptive_budget_dropped", message } : { code: "sampling_knob_dropped", knob: "thinkingBudgetTokens", message },
    );
  }
  return { effort: level };
}

/** The output cap a side-generation call sends: its visible budget, plus the room its reasoning may take when
 *  reasoning runs (the budget itself, else the effort's share of the model's budget range), within the model's
 *  own output cap. A call that does not reason keeps its visible budget as-is. */
export function sideGenOutputCap(capability: GenerationCapability, reasoning: ResolvedReasoning, visible: number | undefined): number | undefined {
  if (visible === undefined || !reasoning.enabled) {
    return visible;
  }
  const effort = reasoning.effort ?? effectiveEffort({}, capability) ?? UNSTATED_ALLOWANCE_EFFORT;
  const allowance = reasoning.budgetTokens ?? budgetForEffort(effort, capability.reasoning.budgetRange ?? REASONING_ALLOWANCE_RANGE);
  return Math.min(capability.output.maxTokens.max, visible + allowance);
}

// The off turn: no effort, display or budget rides it, so the model's off spelling (`between-tools` takes no other
// field) is legal whatever the caller's other knobs said. A model that cannot reason has no off to spell.
function offReasoning(capability: GenerationCapability, effort: UserIntent["effort"]): ResolvedReasoning {
  const r = capability.reasoning;
  if (!r.enabled) {
    return { mode: r.mode, enabled: false };
  }
  return { mode: r.mode, enabled: false, offMode: reasoningOffModeOf(capability), ...(effort === EFFORT_OFF ? { offChosen: true } : {}) };
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
    return offReasoning(capability, effort);
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
  // Every numeric knob takes the same gate-and-clamp; only temperature has a quality rung beneath it.
  const ranged: { [K in SamplingRangeKnob]?: number } = {};
  for (const knob of SAMPLING_RANGE_KNOBS) {
    const wanted = knob === "temperature" ? effectiveSampling(params.temperature, quality, "temperature") : params[knob];
    const value = resolveNumeric(knob, wanted, s[knob], warnings);
    if (value !== undefined) {
      ranged[knob] = value;
    }
  }
  const seed = resolveFlag("seed", params.seed, s.seed, warnings);
  const logitBias = resolveFlag("logitBias", params.logitBias, s.logitBias, warnings);
  const stop = resolveFlag("stop", params.stop, s.stop, warnings);
  const drySequenceBreakers = resolveFlag("drySequenceBreakers", params.drySequenceBreakers, s.drySequenceBreakers, warnings);
  const bannedStrings = resolveFlag("bannedStrings", params.bannedStrings, s.bannedStrings, warnings);
  const banEos = resolveFlag("banEos", params.banEos, s.banEos, warnings);
  const samplerOrder = resolveSamplerOrder(params.samplerOrder, s.samplerOrder, warnings) ?? stageOrderFor(ranged, s.samplerOrder);
  const gated: ResolvedSampling = {
    ...ranged,
    ...(seed !== undefined ? { seed } : {}),
    ...(logitBias !== undefined ? { logitBias } : {}),
    ...(stop !== undefined ? { stop } : {}),
    ...(drySequenceBreakers !== undefined ? { drySequenceBreakers } : {}),
    ...(bannedStrings !== undefined ? { bannedStrings } : {}),
    ...(banEos !== undefined ? { banEos } : {}),
    ...(samplerOrder !== undefined ? { samplerOrder } : {}),
  };
  return dropExclusive(gated, s.exclusive, warnings);
}

/** The server's own default order, when a set knob acts only where its stage runs and the preset stores no
 *  order (`SAMPLER_KNOB_STAGES`): llama.cpp's adaptive-P needs `adaptive_p` in `samplers`. */
function stageOrderFor(
  ranged: { readonly [K in SamplingRangeKnob]?: number },
  orderable: readonly SamplerStage[] | undefined,
): readonly SamplerStage[] | undefined {
  if (orderable === undefined) {
    return;
  }
  const needsStage = SAMPLING_RANGE_KNOBS.some((knob) => {
    const stage = SAMPLER_KNOB_STAGES[knob];
    return ranged[knob] !== undefined && stage !== undefined && orderable.includes(stage);
  });
  return needsStage ? orderable : undefined;
}

/** A summarize/structured call's sampling through the chat turn's own gate: a knob the capability does not
 *  state drops with `sampling_knob_dropped`, a stated one is clamped into its range. The output cap stays the
 *  caller's. Side generation and chat therefore send the same knobs to the same model. */
export function resolveTaskSampling(sampling: TaskSampling, capability: GenerationCapability, warnings: ResolvedWarning[]): TaskSampling {
  // Reasoning is not a sampler: the wire resolves it through `resolveSideGenReasoning`, so it passes through.
  const { maxTokens, effort, thinkingBudgetTokens, stop, drySequenceBreakers, bannedStrings, samplerOrder, ...knobs } = sampling;
  const params: UserIntent = {
    ...knobs,
    ...(stop !== undefined ? { stop: [...stop] } : {}),
    ...(drySequenceBreakers !== undefined ? { drySequenceBreakers: [...drySequenceBreakers] } : {}),
    ...(bannedStrings !== undefined ? { bannedStrings: [...bannedStrings] } : {}),
    ...(samplerOrder !== undefined ? { samplerOrder: [...samplerOrder] } : {}),
  };
  return {
    ...resolveSampling(params, capability, warnings),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(effort !== undefined ? { effort } : {}),
    ...(thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens } : {}),
  };
}

/** The order this server runs for the preset's (`completeSamplerOrder`, D295). A stage the server cannot
 *  order is named in one drop warning. */
function resolveSamplerOrder(
  wanted: UserIntent["samplerOrder"],
  orderable: GenerationCapability["sampling"]["samplerOrder"],
  warnings: ResolvedWarning[],
): readonly SamplerStage[] | undefined {
  if (wanted === undefined) {
    return;
  }
  if (orderable === undefined) {
    warnings.push({ code: "sampling_knob_dropped", knob: "samplerOrder", message: "samplerOrder ignored: this model's server takes no sampler order" });
    return;
  }
  const unorderable = wanted.filter((stage) => !orderable.includes(stage));
  if (unorderable.length > 0) {
    warnings.push({
      code: "sampling_knob_dropped",
      knob: "samplerOrder",
      message: `samplerOrder stages ${unorderable.join(", ")} ignored: this model's server cannot order them`,
    });
  }
  return completeSamplerOrder(wanted, orderable);
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
