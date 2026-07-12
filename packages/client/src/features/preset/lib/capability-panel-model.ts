// The descriptor-driven PARAMS-panel MODEL (W10 Panel 2 / capability-turn-shaping/04 §W10 + the deferred
// connection-capability-panel.md). PURE data + mapping — the panel RENDERS from `ModelCapability` (the
// `ModelCapabilityView` the `connection.getModelCapability` router ships): a sampling knob shows ONLY
// where the descriptor lists it, slider ranges come from each knob's `Range`, reasoning control is keyed
// by the model's ACTUAL `reasoning` axis, and `verbosity` shows only when present. NO hardcoded knob
// stack, NO model-name string-matching.
//
// THE GATE (owner-ruled — connection-capability-panel.md Proposal 1 "Gate candidate"): this file (and the
// panel it feeds) imports the knob vocabulary ONLY from `@orb/contracts` (`ModelCapability`, its `Range`,
// the reasoning/effort/verbosity unions). A static knob list imported from ANYWHERE ELSE, or a
// `model.includes("claude")`-style branch, is a DESIGN FAILURE (it defeats descriptor-iteration + drifts
// the bounds). The panel derives every knob it renders from the capability descriptor here — one home.
//
// The `quality` DIAL (fast/balanced/deep — `UserIntent.quality`, the PRIMARY ~95%-of-presets control) is
// a distinct user field; the RESOLVER (a later W-wave, server side) maps it onto the descriptor axes
// (`reasoning.mode`/effort + a per-model sampling preset) as DISTINCT fields, NEVER a merged cascade. The
// per-model numbers are deferred to live tuning (the catalog `DEFER(promotion)` posture); this client
// model only owns the DIAL's labels + the "what the dial governs" copy, and the raw descriptor knobs live
// under the panel's "advanced" reveal.

import type { EffortLevel, ModelCapability, Range, Verbosity } from "@orb/contracts/connection";
import type { Quality } from "@orb/contracts/preset";
import { QUALITY_LEVELS } from "@orb/contracts/preset";

// ── The sampling axis — which knobs the descriptor lists, in a stable render order ──────────────────
// Each entry names the `UserIntent`/`PromptConfig.params` path it binds, the human label, and the
// `capability.sampling` key that GATES it (the knob renders only when that key carries a `Range`). The
// order is the render order; a knob absent from the descriptor is simply skipped (`samplingKnobsFor`).

/** One sampling knob the panel MAY render — bound to a `UserIntent` numeric path, gated by a descriptor key. */
/** The `PromptConfig.params.*` numeric-knob paths a sampling slider may bind — declared ONCE as a tuple
 *  (§7.5 no-inline-union-redecl) and derived, so the union has one home. A typed literal (not a bare
 *  `string`) so the editor's `form.AppField name={knob.field}` type-checks against TanStack's field names.
 *  File-local (§7.4 — the interface below carries it; the tuple isn't exported). */
const SAMPLING_PARAM_PATHS = [
  "params.temperature",
  "params.topP",
  "params.topK",
  "params.minP",
  "params.frequencyPenalty",
  "params.presencePenalty",
  "params.repetitionPenalty",
] as const;
type SamplingParamPath = (typeof SAMPLING_PARAM_PATHS)[number];

export interface SamplingKnobSpec {
  /** The `capability.sampling` key that gates this knob (renders only when it carries a `Range`). */
  readonly key: keyof NonNullable<ModelCapability["sampling"]>;
  /** The `params.<field>` path this knob binds (the nested TanStack Form name — a typed literal). */
  readonly field: SamplingParamPath;
  /** The row's human label. */
  readonly label: string;
  /** A one-line explainer (the field description). */
  readonly description: string;
  /** Slider step (the knob's granularity — integers use `1`). */
  readonly step: number;
}

// The RANGE-bearing sampling knobs, in render order. `seed`/`logitBias`/`stop` are descriptor BOOLEAN
// flags (support, not a `Range`) — they are NOT slider knobs, so they are excluded here (the panel renders
// them, when supported, as their own controls: a number field for `seed`, textareas for stop/bias — not a
// bounded slider). `minP` (D68-A) is a first-class knob wherever the descriptor lists a `Range` for it.
const SAMPLING_KNOB_SPECS: readonly SamplingKnobSpec[] = [
  {
    key: "temperature",
    field: "params.temperature",
    label: "Temperature",
    description: "Higher is more random/creative; lower is more focused/deterministic.",
    step: 0.01,
  },
  {
    key: "topP",
    field: "params.topP",
    label: "Top-P",
    description: "Nucleus sampling — the cumulative-probability cutoff for candidate tokens.",
    step: 0.01,
  },
  {
    key: "topK",
    field: "params.topK",
    label: "Top-K",
    description: "Keep only the K most-likely tokens each step (0 = unlimited).",
    step: 1,
  },
  {
    key: "minP",
    field: "params.minP",
    label: "Min-P",
    description: "Drop tokens below this fraction of the top token's probability (RP-critical).",
    step: 0.01,
  },
  {
    key: "frequencyPenalty",
    field: "params.frequencyPenalty",
    label: "Frequency penalty",
    description: "Discourage repeating tokens in proportion to how often they've appeared.",
    step: 0.01,
  },
  {
    key: "presencePenalty",
    field: "params.presencePenalty",
    label: "Presence penalty",
    description: "Discourage reusing any token that has already appeared at all.",
    step: 0.01,
  },
  {
    key: "repetitionPenalty",
    field: "params.repetitionPenalty",
    label: "Repetition penalty",
    description: "A multiplicative penalty on repeated tokens (1 = off).",
    step: 0.01,
  },
];

/** One renderable sampling knob — a spec PLUS the concrete `Range` the descriptor supplied for it. */
export interface ResolvedSamplingKnob extends SamplingKnobSpec {
  readonly range: Range;
}

/**
 * The sampling knobs the panel renders for a given capability — ONLY the specs whose `capability.sampling`
 * key carries a `Range`, in render order, each paired with that descriptor `Range` (the slider bounds).
 * A model with `sampling: {}` (agent-sdk Claude) yields `[]` → the panel shows NO sampling section. An
 * unlisted knob is absent (never a disabled-slider). The single source of the panel's slider bounds.
 */
export function samplingKnobsFor(capability: ModelCapability): readonly ResolvedSamplingKnob[] {
  const sampling = capability.sampling;
  const knobs: ResolvedSamplingKnob[] = [];
  for (const spec of SAMPLING_KNOB_SPECS) {
    const range = sampling[spec.key];
    // The seed/logitBias/stop flags are booleans on `sampling`; the SAMPLING_KNOB_SPECS list only names
    // Range-bearing keys, so every `range` here is a `Range | undefined` — narrow to a real Range.
    if (range !== undefined && typeof range !== "boolean") {
      knobs.push({ ...spec, range });
    }
  }
  return knobs;
}

/** `true` when the descriptor supports a raw integer `seed` (a distinct control from the sliders above). */
export function supportsSeed(capability: ModelCapability): boolean {
  return capability.sampling.seed === true;
}

// ── The reasoning axis — keyed by `reasoning.mode` (connection-capability-panel.md Proposal 1) ──────
// `enabled` is its OWN on/off axis (`effort:'none'` is NOT the off-switch — `EFFORT_LEVELS` has no
// `'none'` on the model side). The control shape the panel renders is DERIVED from `reasoning.mode`:
//   • mode 'none'    → the model does not reason at all: NO reasoning control at all.
//   • mode 'effort'  → an off-toggle (`enabled`) + an effort dropdown of the model's ACTUAL `effortLevels`.
//   • mode 'budget'  → an off-toggle + a budget slider from `budgetRange` (thinkingBudgetTokens).
//   • mode 'adaptive'→ an off-toggle + an "adaptive" note (the model self-budgets; no manual dial).

/** The panel's reasoning-control shapes — one tuple home (§7.5), derived. File-local (the component reads
 *  it off `ReasoningControl.kind`, never as a bare exported alias — §7.4). */
const REASONING_CONTROL_KINDS = ["none", "effort", "budget", "adaptive"] as const;
type ReasoningControlKind = (typeof REASONING_CONTROL_KINDS)[number];

/** What the reasoning section renders for a capability — the control kind + the descriptor facts it needs. */
export interface ReasoningControl {
  readonly kind: ReasoningControlKind;
  /** `false` when the model cannot reason at all (`mode === 'none'`) — the section renders nothing. */
  readonly reasons: boolean;
  /** The model's REAL effort levels (only when `kind === 'effort'`) — the dropdown options; never the full enum. */
  readonly effortLevels?: readonly EffortLevel[];
  /** The token-budget range (only when `kind === 'budget'`) — the `thinkingBudgetTokens` slider bounds. */
  readonly budgetRange?: Range;
}

/**
 * Derive the reasoning control from the capability descriptor. The panel renders an off-toggle
 * (`params.effort === 'none'` ⇔ disabled — the user-intent `EFFORT_LEVELS` carries `'none'` as the
 * off-value) plus, per `kind`: the effort dropdown (model's `effortLevels`), the budget slider
 * (`budgetRange`), or the adaptive note. A `mode:'none'` model renders no reasoning control at all.
 */
export function reasoningControlFor(capability: ModelCapability): ReasoningControl {
  const reasoning = capability.reasoning;
  if (reasoning.mode === "none") {
    return { kind: "none", reasons: false };
  }
  if (reasoning.mode === "effort") {
    return {
      kind: "effort",
      reasons: true,
      // The model's ACTUAL levels only (never the full EFFORT_LEVELS enum) — absent ⇒ an empty list, and
      // the panel falls back to just the off-toggle rather than inventing levels.
      effortLevels: reasoning.effortLevels ?? [],
    };
  }
  if (reasoning.mode === "budget") {
    return {
      kind: "budget",
      reasons: true,
      ...(reasoning.budgetRange !== undefined ? { budgetRange: reasoning.budgetRange } : {}),
    };
  }
  return { kind: "adaptive", reasons: true };
}

/** The verbosity levels the panel renders — the descriptor's own list, or `undefined` when the model does
 *  not honor verbosity (the section is then absent — no disabled control, D68-B). */
export function verbosityLevelsFor(capability: ModelCapability): readonly Verbosity[] | undefined {
  return capability.verbosity;
}

// ── The quality DIAL (the PRIMARY ergonomic control — `UserIntent.quality`) ─────────────────────────

/** The `(quality, label, description)` triples, in the `QUALITY_LEVELS` order (fast → deep). A tuple ARRAY
 *  keyed by the canonical union so a new quality level is a `tsc` error until it has copy. */
const QUALITY_META: Record<Quality, { readonly label: string; readonly description: string }> = {
  fast: { label: "Fast", description: "Snappy replies — minimal reasoning, cheaper." },
  balanced: { label: "Balanced", description: "The everyday default — reasons when it helps." },
  deep: { label: "Deep", description: "Thorough — more reasoning, higher quality, slower." },
};

/** One quality-dial option (the dial's segmented picker). */
export interface QualityOption {
  readonly value: Quality;
  readonly label: string;
  readonly description: string;
}

/** The quality-dial options in canonical order (fast → balanced → deep). The dial is the primary control;
 *  the raw descriptor knobs above live under the panel's "advanced" reveal. */
export const QUALITY_OPTIONS: readonly QualityOption[] = QUALITY_LEVELS.map((value) => ({
  value,
  label: QUALITY_META[value].label,
  description: QUALITY_META[value].description,
}));

// The quality→axes MAPPING lives SERVER-SIDE, not here (Proposal 2 / R9): the resolver
// (`infra/providers/resolve-chat.ts`) reads the ONE contract home `QUALITY_EFFORT` (@orb/contracts/preset)
// and feeds it as the DEFAULT effort beneath an explicit `effort` knob, then clamps to the model's real
// `effortLevels`. This client model owns ONLY the dial's display copy (QUALITY_OPTIONS above); it must NOT
// re-map quality → effort (a second derivation would drift from the funnel). Per-model sampling numbers are
// deferred to live tuning (the catalog `DEFER(promotion)` posture).
