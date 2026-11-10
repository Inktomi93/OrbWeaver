import { z } from "zod";
import { ADJUSTED_KNOBS } from "../chat/adjusted-knobs.ts";
import { effortLevelSchema } from "./capability/generation.ts";

/** One code per distinct drop site a resolver/transport actually emits; clamps are silent. Every member has a
 *  NAMED client home (§5.3a): the ambient capability panel, the aggregated per-turn notice, the Extras row,
 *  the connection badge, or the room. */
export const WARNING_CODE = {
  // A sampling/quality knob was not sent: the resolved model exposes no range for it, does not support it, or (for
  // `thinkingBudgetTokens`) reasons by effort level and has no budget field. `knob` names which.
  samplingKnobDropped: "sampling_knob_dropped",
  // Two knobs the model rejects TOGETHER (`capability.sampling.exclusive`, current Claude on the direct wire:
  // temperature + top_p); the funnel keeps the first-listed and drops the other, loudly.
  samplingKnobConflict: "sampling_knob_conflict",
  // The requested reasoning effort is not one the model lists, so it chose its own.
  effortDropped: "effort_dropped",
  // A thinking-budget request hit an adaptive-reasoning model, which budgets itself (an explicit budget 400s it).
  adaptiveBudgetDropped: "adaptive_budget_dropped",
  // The requested reasoning-display mode, or verbosity level, is not one the model offers.
  displayDropped: "display_dropped",
  verbosityDropped: "verbosity_dropped",
  // The per-turn system half was asked to ride the mid-conversation hook channel on a model that does not honor one,
  // so it was folded into the system block instead.
  dynamicContextDemoted: "dynamic_context_demoted",
  imageEditDropped: "image_edit_dropped",
  // The image wire has no channel for the knob: it returned fewer pictures, or its own shape, than asked.
  imageCountDropped: "image_count_dropped",
  imageSizeDropped: "image_size_dropped",
  // An effort-`none`/absent intent on a MANDATORY-reasoning model was clamped UP to the lowest supported
  // effort (the model rejects `effort:'none'` — an honest visible degrade, never a silent 400).
  reasoningMandatoryClamp: "reasoning_mandatory_clamp",
  // A budget-mode reasoning budget was clamped DOWN to leave visible-output headroom below the resolved
  // `maxOutputTokens` (the budget counts against the output cap on Anthropic/OR-responses).
  reasoningBudgetClamped: "reasoning_budget_clamped",
  // A connection's `extras` key was DROPPED: the openrouter transport takes no extras beyond its modelled
  // ones, and on openai-compatible a belt-owned key is dropped (any other key merges over the computed body).
  // Carries `key`. Emitted at AUTHORING time by the Extras editor too.
  customParametersIgnored: "custom_parameters_ignored",
  cacheControlAdjusted: "cache_control_adjusted",
  // A history `tool-result` part carried `isError:true`, which the OpenAI-shaped wires cannot express.
  toolResultErrorDropped: "tool_result_error_dropped",
  // A forced tool choice (`required` / a named `tool`) went out as `auto`: that form cannot be forced on this
  // model or server (`capability.tools.requiredChoice` / `namedChoice: false`). The tools still ride; only the
  // forcing was withdrawn.
  toolChoiceDowngraded: "tool_choice_downgraded",
  // A `conversation` reasoning carry ran as `tool-chain`: the model binds thinking to its prefix and this route
  // cannot keep a prefix edit from failing the turn (`capability.reasoning.prefixEditSafe`), so thinking rides
  // back only inside the turn's own tool loop, where the prefix does not change.
  carryReasoningDowngraded: "carry_reasoning_downgraded",
  // A CONTENT prefill with thinking on ⇒ an empty reply on a server whose folded
  // `features.prefillSuppressesThinking` says so; the prefill wins and the thinking toggle is dropped.
  reasoningDroppedForPrefill: "reasoning_dropped_for_prefill",
  // The CONNECTION's `declared` block overrode a dated measurement on the named field (§6.2). NEVER on the turn
  // stream — a badge on the connection row (the user asked for it).
  declaredOverridesMeasured: "declared_overrides_measured",
  // A background task (digests/caption/…) had no fundable row: the shared "nothing ran" notice.
  backgroundTaskDegraded: "background_task_degraded",
  // ── the SDK's OWN drops (§A3) ───────────────────────────────────────────────────────────────────────
  // These three carry what the Vercel provider stripped AFTER our funnel ran, which is a SECOND gate the
  // capability fold does not model: the funnel can resolve `temperature` from a measured range and the
  // provider still refuse it for this model. Distinct codes (not the funnel's `sampling_knob_dropped`) so a
  // receipt says WHO dropped the knob — ours or the SDK's — which is the difference between a wrong curated
  // cell and a wrong model id.
  //
  // A setting the provider does not support for this model (`SharedV4Warning.type: "unsupported"` on a
  // non-tool feature). Carries `knob` when the SDK's feature name is one of ours.
  sdkUnsupportedSetting: "sdk_unsupported_setting",
  // A TOOL the provider refused: an unknown provider-defined tool, or `strict` on a tool the provider has no
  // strict mode for (`unsupported` with a `tool …` / `provider-defined tool …` feature).
  sdkUnsupportedTool: "sdk_unsupported_tool",
  // The provider ran in a COMPATIBILITY mode or used a deprecated spelling — a default thinking budget, an
  // output cap guessed for an unknown model, a `providerOptions` key it wants spelled differently. Suboptimal
  // rather than dropped, and the one class that is usually OUR configuration to fix.
  sdkCompatibility: "sdk_compatibility",
} as const;
export type WarningCode = (typeof WARNING_CODE)[keyof typeof WARNING_CODE];

/** The existing wire decoder accepts optional detail fields on previously produced warnings. */
export const resolvedWarningSchema = z.strictObject({
  code: z.enum(WARNING_CODE),
  message: z.string(),
  knob: z.enum(ADJUSTED_KNOBS).optional(),
  key: z.string().optional(),
  field: z.string().optional(),
  appliedBudget: z.number().optional(),
  appliedEffort: effortLevelSchema.optional(),
});
type WarningWire = z.infer<typeof resolvedWarningSchema>;
type WarningDetail = Exclude<keyof WarningWire, "message" | "code">;

const DETAIL_CODES = {
  knob: [WARNING_CODE.samplingKnobDropped, WARNING_CODE.samplingKnobConflict, WARNING_CODE.carryReasoningDowngraded, WARNING_CODE.sdkUnsupportedSetting],
  key: [WARNING_CODE.customParametersIgnored],
  field: [WARNING_CODE.declaredOverridesMeasured],
  appliedBudget: [WARNING_CODE.reasoningBudgetClamped],
  appliedEffort: [WARNING_CODE.reasoningMandatoryClamp],
} as const satisfies Record<WarningDetail, readonly WarningCode[]>;

type WarningShape<Code extends WarningCode, Detail extends WarningDetail> = {
  readonly code: Code;
  readonly message: string;
} & Readonly<Pick<WarningWire, Detail>> & { readonly [Other in Exclude<WarningDetail, Detail>]?: never };

type DetailedWarning = { [Field in WarningDetail]: WarningShape<(typeof DETAIL_CODES)[Field][number], Field> }[WarningDetail];

/** A resolver emits only the structured detail its code describes. Wire readers preserve already-stored fields. */
export type ResolvedWarning = DetailedWarning | WarningShape<Exclude<WarningCode, DetailedWarning["code"]>, never>;

const codesWithDetail: ReadonlySet<WarningCode> = new Set(Object.values(DETAIL_CODES).flat());
const plainCodes = Object.values(WARNING_CODE).filter((code): code is Exclude<WarningCode, DetailedWarning["code"]> => !codesWithDetail.has(code));
const { message, knob, key, field, appliedBudget, appliedEffort } = resolvedWarningSchema.shape;

/** A live resolver output may carry only the detail defined for its warning code. */
export const emittedWarningSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.enum(plainCodes), message }),
  z.strictObject({ code: z.enum(DETAIL_CODES.knob), message, knob }),
  z.strictObject({ code: z.enum(DETAIL_CODES.key), message, key }),
  z.strictObject({ code: z.enum(DETAIL_CODES.field), message, field }),
  z.strictObject({ code: z.enum(DETAIL_CODES.appliedBudget), message, appliedBudget }),
  z.strictObject({ code: z.enum(DETAIL_CODES.appliedEffort), message, appliedEffort }),
]) satisfies z.ZodType<ResolvedWarning>;
