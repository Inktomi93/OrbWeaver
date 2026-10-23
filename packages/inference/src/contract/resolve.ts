// The resolved-chat-knobs type home: the output of the (UserIntent × GenerationCapability) → wire knobs
// funnel (`funnel/resolve-chat.ts`). Only the funnel builds these; every backend consumes the identical shape.

import type {
  CachePolicy,
  CachePolicyContext,
  EffortLevel,
  GenerationCapability,
  ReasoningDisplayMode,
  ReasoningMode,
  ReasoningOffMode,
  ResolvedWarning,
  SamplerStage,
  SamplingRangeKnob,
  UserRoleHandling,
  Verbosity,
} from "@orb/contracts/inference";

import type { CarryReasoning, ResponseCacheControl, ResponseCacheSettings } from "@orb/contracts/preset";

/** The house default effort (owner ruling): a turn whose caller set neither an effort nor a quality runs a model
 *  that supports adaptive thinking (`reasoning.mode: "adaptive"`) at this effort, on every route. It outranks any
 *  model- or catalog-stated default; an explicit caller value, `none` included, always wins. */
export const ADAPTIVE_DEFAULT_EFFORT = "high" as const satisfies EffortLevel;

/** The capability-resolved reasoning decision after the adaptive/budget guard, effort clamp, and display gate. */
export type ResolvedReasoning =
  | {
      readonly mode: ReasoningMode;
      readonly enabled: false;
      /** Explicit caller off, rather than an unset effort that leaves the model default active. */
      readonly offChosen?: true | undefined;
      readonly offMode?: ReasoningOffMode | undefined;
      readonly effort?: never;
      readonly budgetTokens?: never;
      readonly display?: never;
    }
  | {
      readonly mode: Extract<ReasoningMode, "budget">;
      readonly enabled: true;
      readonly offChosen?: never;
      readonly offMode?: never;
      readonly effort?: never;
      readonly budgetTokens?: number | undefined;
      readonly display?: ReasoningDisplayMode | undefined;
    }
  | {
      readonly mode: Exclude<ReasoningMode, "budget">;
      readonly enabled: true;
      readonly offChosen?: never;
      readonly offMode?: never;
      readonly effort?: EffortLevel | undefined;
      readonly budgetTokens?: never;
      readonly display?: ReasoningDisplayMode | undefined;
    };

/** Every numeric sampler the funnel resolved (clamped into the capability's `Range`), the flag knobs, and the
 *  stage order narrowed to the stages the server can order. */
export type ResolvedSampling = { readonly [K in SamplingRangeKnob]?: number | undefined } & {
  readonly seed?: number | undefined;
  readonly logitBias?: Record<string, number> | undefined;
  readonly stop?: readonly string[] | undefined;
  readonly drySequenceBreakers?: readonly string[] | undefined;
  readonly bannedStrings?: readonly string[] | undefined;
  readonly banEos?: boolean | undefined;
  readonly samplerOrder?: readonly SamplerStage[] | undefined;
};

export interface ResolvedChatKnobs {
  /** Additive to the request-scoped requestId — disambiguates several provider turns inside one request. */
  readonly turnId: string;
  readonly reasoning: ResolvedReasoning;
  /** How much of the model's OWN prior thinking rides back on this turn (§8.8), after the capability gate and
   *  the reasoning-enabled coherence rule. The wire does not spell it — `v4/prompt.ts` already emits whatever
   *  reasoning parts the delivered history carries — so this is the ASSEMBLY's instruction, resolved here so
   *  the policy has one home. The chat engine reads the same answer through `resolveCarryReasoning`. */
  readonly carryReasoning: CarryReasoning;
  readonly sampling: ResolvedSampling;
  /** The output cap the wire sends: the caller's visible cap, plus room for reasoning on a side-generation turn. */
  readonly maxOutputTokens?: number | undefined;
  /** The output cap a replay sends when the wire refuses this turn's chosen off and the model then reasons at its
   *  own default (OpenRouter's mandatory-reasoning replay): room for that reasoning where the posture grows the cap. */
  readonly replayMaxOutputTokens?: number | undefined;
  readonly verbosity?: Verbosity | undefined;
  /** Emit `modalities: ["text","image"]` on the wire — the preset asked (`replyMedia: text+image`) AND the
   *  model's `output.modalities ∋ image` (§6.7). */
  readonly replyImages: boolean;
  readonly warnings: readonly ResolvedWarning[];
}

/** The (EmbedOptions × EmbeddingCapability) fold: the width an MRL model is asked for, plus the instruction
 *  the model honours. */
export interface ResolvedEmbedKnobs {
  readonly dimensions?: number | undefined;
  readonly instruction?: string | undefined;
  readonly inputType?: "query" | "document" | undefined;
  readonly warnings: readonly ResolvedWarning[];
}

export interface ResolveCachePolicyInput {
  readonly context: CachePolicyContext;
  readonly generation?: GenerationCapability | undefined;
  readonly preset?: ResponseCacheSettings | undefined;
  readonly request?: ResponseCacheControl | undefined;
  readonly fresh?: boolean | undefined;
  readonly requestedDepth?: number | undefined;
  readonly requestedRoleHandling?: UserRoleHandling | undefined;
}

export interface ResolvedCachePolicy {
  readonly plan: CachePolicy;
  readonly warnings: readonly ResolvedWarning[];
}
