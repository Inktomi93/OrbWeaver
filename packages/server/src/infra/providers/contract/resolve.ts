// The resolved-chat-knobs type home: the output shape of the (UserIntent x ModelCapability) → wire knobs
// funnel (resolve-chat.ts). Only resolve-chat builds these; both sealed chat runners consume an identical shape.

import type { EffortLevel, ReasoningDisplayMode, ReasoningMode, Verbosity } from "@orb/contracts/connection";

// One code per distinct drop site a resolver/runner actually emits; clamps are silent (no clamp code). Most
// are resolve-chat's knob drops; `image_edit_dropped` is the image runner's edit-strip belt (an `edit`
// payload reaching a model whose capability lacks `input.imageEdit` — imagery-design/03 §2).
export const WARNING_CODES = [
  "sampling_knob_dropped",
  "effort_dropped",
  "adaptive_budget_dropped",
  "display_dropped",
  "verbosity_dropped",
  "dynamic_context_demoted",
  "image_edit_dropped",
  // C6 (comfyui-control §4.6/§4.12): per-lever edit drops when a curated ComfyUI role's family can't honor a
  // provided edit input — the mask on a no-inpaint family, the reference on a no-identity arch, or the pose
  // control map on a no-ControlNet family. The rest of the image still generates (a granular visible degrade,
  // never a silent build), unlike the wholesale `image_edit_dropped` on a raw-checkpoint txt2img template.
  "image_inpaint_dropped",
  "image_identity_dropped",
  "image_pose_dropped",
  // R0: an effort-`none`/absent intent on a MANDATORY-reasoning model was clamped UP to the lowest
  // supported effort (the model rejects `effort:'none'` — an honest visible degrade, never a silent 400).
  "reasoning_mandatory_clamp",
  // MA-5: a budget-mode reasoning budget was clamped DOWN to leave visible-output headroom below the
  // resolved `maxOutputTokens` (on Anthropic/OR-responses the reasoning budget counts against the output
  // cap — an unclamped budget ≥ cap 400s or starves the structured/visible payload). Visible, never silent.
  "reasoning_budget_clamped",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

// Where the volatile dynamic system-prompt half rides:
//   • "system-block" — joined into the cached system string (authoritative, but a change re-writes the whole block).
//   • "message-tail" — a mid-conversation-system channel at the message tail (cache-safe), only on a model that honors it.
export const DYNAMIC_CONTEXT_CHANNELS = ["system-block", "message-tail"] as const;
export type DynamicContextChannel = (typeof DYNAMIC_CONTEXT_CHANNELS)[number];

export interface ResolvedWarning {
  readonly code: WarningCode;
  readonly message: string;
}

/** The capability-resolved reasoning decision after the adaptive/budget guard, effort clamp, and display gate. */
export interface ResolvedReasoning {
  readonly mode: ReasoningMode;
  readonly enabled: boolean;
  readonly effort?: EffortLevel | undefined;
  /** Present only for budget mode — dropped for adaptive (sending enabled+budget_tokens 400s some models). */
  readonly budgetTokens?: number | undefined;
  readonly display?: ReasoningDisplayMode | undefined;
}

export interface ResolvedSampling {
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly repetitionPenalty?: number | undefined;
  readonly minP?: number | undefined;
  readonly topA?: number | undefined;
  readonly seed?: number | undefined;
  readonly logitBias?: Record<string, number> | undefined;
  readonly stop?: readonly string[] | undefined;
}

export interface ResolvedChatKnobs {
  /** Additive to the request-scoped requestId — disambiguates multiple provider turns inside one request. */
  readonly turnId: string;
  readonly reasoning: ResolvedReasoning;
  readonly sampling: ResolvedSampling;
  readonly dynamicContextChannel: DynamicContextChannel;
  readonly maxOutputTokens?: number | undefined;
  /** Applied on the responses wire; a chat-completions turn drops it loudly (verbosity_dropped). */
  readonly verbosity?: Verbosity | undefined;
  readonly warnings: readonly ResolvedWarning[];
}
