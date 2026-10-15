import { z } from "zod";
import type { AdjustedKnob } from "../chat/adjusted-knobs.ts";
import { ADJUSTED_KNOBS } from "../chat/adjusted-knobs.ts";
import type { EffortLevel } from "./capability/generation.ts";
import { effortLevelSchema } from "./capability/generation.ts";

/** One code per distinct drop site a resolver/transport actually emits; clamps are silent. Every member has a
 *  NAMED client home (§5.3a): the ambient capability panel, the aggregated per-turn notice, the Extras row,
 *  the connection badge, or the room. */
export const WARNING_CODES = [
  "sampling_knob_dropped",
  // Two knobs the model rejects TOGETHER (`capability.sampling.exclusive`, current Claude on the direct wire:
  // temperature + top_p); the funnel keeps the first-listed and drops the other, loudly.
  "sampling_knob_conflict",
  "effort_dropped",
  "adaptive_budget_dropped",
  "display_dropped",
  "verbosity_dropped",
  "dynamic_context_demoted",
  "image_edit_dropped",
  // An effort-`none`/absent intent on a MANDATORY-reasoning model was clamped UP to the lowest supported
  // effort (the model rejects `effort:'none'` — an honest visible degrade, never a silent 400).
  "reasoning_mandatory_clamp",
  // A budget-mode reasoning budget was clamped DOWN to leave visible-output headroom below the resolved
  // `maxOutputTokens` (the budget counts against the output cap on Anthropic/OR-responses).
  "reasoning_budget_clamped",
  // A connection's `extras` key was DROPPED: the openrouter transport takes no extras beyond its modelled
  // ones, and on openai-compatible a belt-owned key is dropped (any other key merges over the computed body).
  // Carries `key`. Emitted at AUTHORING time by the Extras editor too.
  "custom_parameters_ignored",
  "cache_control_adjusted",
  // A history `tool-result` part carried `isError:true`, which the OpenAI-shaped wires cannot express.
  "tool_result_error_dropped",
  // A forced tool choice (`required` / a named `tool`) went out as `auto`: that form cannot be forced on this
  // model or server (`capability.tools.requiredChoice` / `namedChoice: false`). The tools still ride; only the
  // forcing was withdrawn.
  "tool_choice_downgraded",
  // A `conversation` reasoning carry ran as `tool-chain`: the model binds thinking to its prefix and this route
  // cannot keep a prefix edit from failing the turn (`capability.reasoning.prefixEditSafe`), so thinking rides
  // back only inside the turn's own tool loop, where the prefix does not change.
  "carry_reasoning_downgraded",
  // A CONTENT prefill with thinking on ⇒ an empty reply on a server whose folded
  // `features.prefillSuppressesThinking` says so; the prefill wins and the thinking toggle is dropped.
  "reasoning_dropped_for_prefill",
  // The CONNECTION's `declared` block overrode a dated measurement on the named field (§6.2). NEVER on the turn
  // stream — a badge on the connection row (the user asked for it).
  "declared_overrides_measured",
  // A background task (digests/caption/…) had no fundable row: the shared "nothing ran" notice.
  "background_task_degraded",
  // ── the SDK's OWN drops (§A3) ───────────────────────────────────────────────────────────────────────
  // These three carry what the Vercel provider stripped AFTER our funnel ran, which is a SECOND gate the
  // capability fold does not model: the funnel can resolve `temperature` from a measured range and the
  // provider still refuse it for this model. Distinct codes (not the funnel's `sampling_knob_dropped`) so a
  // receipt says WHO dropped the knob — ours or the SDK's — which is the difference between a wrong curated
  // cell and a wrong model id.
  //
  // A setting the provider does not support for this model (`SharedV4Warning.type: "unsupported"` on a
  // non-tool feature). Carries `knob` when the SDK's feature name is one of ours.
  "sdk_unsupported_setting",
  // A TOOL the provider refused: an unknown provider-defined tool, or `strict` on a tool the provider has no
  // strict mode for (`unsupported` with a `tool …` / `provider-defined tool …` feature).
  "sdk_unsupported_tool",
  // The provider ran in a COMPATIBILITY mode or used a deprecated spelling — a default thinking budget, an
  // output cap guessed for an unknown model, a `providerOptions` key it wants spelled differently. Suboptimal
  // rather than dropped, and the one class that is usually OUR configuration to fix.
  "sdk_compatibility",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export interface ResolvedWarning {
  readonly code: WarningCode;
  /** OPERATOR prose — logs and the wire-outcome ring read it; the USER never does (the chat bus admits no
   *  unanchored free text, D16). What crosses to a user is the STRUCTURED half below, re-voiced by the client. */
  readonly message: string;
  /** WHICH setting a `sampling_knob_dropped`/`sampling_knob_conflict` refers to. */
  readonly knob?: AdjustedKnob | undefined;
  /** WHICH `extras` key a `custom_parameters_ignored` refers to. */
  readonly key?: string | undefined;
  /** WHICH capability field a `declared_overrides_measured` refers to. */
  readonly field?: string | undefined;
  /** What the provider USED after a clamp: the reasoning budget in TOKENS (`reasoning_budget_clamped`). */
  readonly appliedBudget?: number | undefined;
  /** What the provider USED after a clamp: the reasoning effort (`reasoning_mandatory_clamp`). */
  readonly appliedEffort?: EffortLevel | undefined;
}

/** Strict: the connection capability read ships warnings to the client through this output parser. */
export const resolvedWarningSchema = z.strictObject({
  code: z.enum(WARNING_CODES),
  message: z.string(),
  knob: z.enum(ADJUSTED_KNOBS).optional(),
  key: z.string().optional(),
  field: z.string().optional(),
  appliedBudget: z.number().optional(),
  appliedEffort: effortLevelSchema.optional(),
}) satisfies z.ZodType<ResolvedWarning>;
