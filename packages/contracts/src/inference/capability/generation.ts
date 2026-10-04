// The GENERATION capability — what a chat/summarize/structured/generateImage model honours, keyed by
// (model × wire-shape), produced once by the package's synthesis and read by the funnel, the assembly and
// the client's capability panel. The modality booleans of the old `ModelCapability` (`input.{vision, video,
// audio, file}`, `outputModalities: string[]`) are `Modality[]` here; every knob a model does not list is
// simply ABSENT (no silent no-ops); the reasoning/sampling/verbosity/output/context/turns axes are kept
// verbatim from the shape they replace. The axis tuples below are THE HOME — `@orb/contracts/connection`
// re-exports them until it is deleted with the source axis.

import { z } from "zod";
import { modalitySchema } from "../modalities.ts";
import { PROMPT_CACHE_TTLS } from "../prompt-cache.ts";
import { WIRE_SCHEMA_MODES } from "../wire-subset.ts";

/** How a model reasons — distinct from on/off (`reasoning.enabled`); `EFFORT_LEVELS` has no `'none'`. */
export const REASONING_MODES = ["none", "effort", "budget", "adaptive"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];
export const reasoningModeSchema = z.enum(REASONING_MODES) satisfies z.ZodType<ReasoningMode>;

/** The model's real effort levels, deliberately EXCLUDING `'none'` — the on/off decision is
 *  `reasoning.enabled`. `contracts/preset.EFFORT_LEVELS` derives from this set, never redeclares it. */
export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const effortLevelSchema = z.enum(EFFORT_LEVELS) satisfies z.ZodType<EffortLevel>;

/** The verbosity axis (OpenAI) — a real, model-gated control, present only when the model honors it. */
export const VERBOSITY_LEVELS = ["low", "medium", "high"] as const;
export type Verbosity = (typeof VERBOSITY_LEVELS)[number];
export const verbositySchema = z.enum(VERBOSITY_LEVELS) satisfies z.ZodType<Verbosity>;

/** WHAT THE MODEL WILL ACCEPT BACK when a prior reply's thinking rides the next request (§8.8). A
 *  CAPABILITY, not an `EndpointFeatures` quirk: features is the openai-compat chat body/stream schema
 *  (§8.1b) and this fact must hold for `anthropic-messages` and `agent-sdk` too.
 *
 *  • `signed` — the wire round-trips an opaque signature / encrypted block (Anthropic thinking blocks,
 *    OpenRouter `reasoning_details`, Gemini thought signatures). The replay is VERIFIED thinking.
 *  • `text`   — only prose can ride back, with no provenance.
 *  • `none`   — do not send prior thinking at all.
 *
 *  Absent ⇒ `REASONING_REPLAY_FLOOR` (`none`), the fail-closed rung (D68/D69): a wire nobody measured
 *  never gets a signed block it may reject. Read through `reasoningReplayOf`, never re-spelled. */
export const REASONING_REPLAY_MODES = ["signed", "text", "none"] as const;
export type ReasoningReplayMode = (typeof REASONING_REPLAY_MODES)[number];
export const reasoningReplayModeSchema = z.enum(REASONING_REPLAY_MODES) satisfies z.ZodType<ReasoningReplayMode>;

/** How a model turns reasoning OFF. `disabled` runs no thinking at all. `between-tools` is the off of a model that
 *  refuses `disabled` (Claude Sonnet 5.5): no thinking before the reply, only short progress notes between tool
 *  calls, legal at effort `high` or below and with no other thinking field beside it. Read through
 *  `reasoningOffModeOf`, never re-spelled. */
export const REASONING_OFF_MODES = ["disabled", "between-tools"] as const;
export type ReasoningOffMode = (typeof REASONING_OFF_MODES)[number];
export const reasoningOffModeSchema = z.enum(REASONING_OFF_MODES) satisfies z.ZodType<ReasoningOffMode>;
/** The off spelling of a model that states none: every model took `disabled` before one refused it. */
export const REASONING_OFF_DEFAULT = "disabled" as const satisfies ReasoningOffMode;

/** The Anthropic-only reasoning-display knob. */
export const REASONING_DISPLAY_MODES = ["summarized", "omitted"] as const;
export type ReasoningDisplayMode = (typeof REASONING_DISPLAY_MODES)[number];
export const reasoningDisplayModeSchema = z.enum(REASONING_DISPLAY_MODES) satisfies z.ZodType<ReasoningDisplayMode>;

/** The message-handling ladder, least to most strict; the tuple order IS the strictness order. Each level adds
 *  to the one before it:
 *
 *  • `none`        — pass rows through; a system row stays a system row wherever the model takes one.
 *  • `merge`       — join adjacent same-role rows with a blank line. Where the turn caches by explicit block
 *                    markers the run stays one turn, but each stored row stays its own block, so a cached block
 *                    never grows.
 *  • `slotted`     — merge, and keep a system run only in its legal slot: the row before it is a user or tool
 *                    row, and the run ends the array or precedes an assistant row. Every other run folds.
 *  • `semi-strict` — merge, and fold every system row into user text.
 *  • `strict`      — semi-strict. The history also opens on a user row, which the new-chat marker delivers.
 *
 *  A fold delivers the row as user text in its neutral frame. The model states its floor
 *  (`turns.roleHandlingFloor`); the preset knob can only raise it (`clampRoleHandling`). */
export const ROLE_HANDLING = ["none", "merge", "slotted", "semi-strict", "strict"] as const;
export type RoleHandling = (typeof ROLE_HANDLING)[number];
export const roleHandlingSchema = z.enum(ROLE_HANDLING) satisfies z.ZodType<RoleHandling>;

/** The levels only a model states: `slotted` is a measured fact about where a system row is legal, never a
 *  preference a preset can hold for every model. */
export const MODEL_ONLY_ROLE_HANDLING = ["slotted"] as const satisfies readonly RoleHandling[];
/** The preset knob's vocabulary: {@link ROLE_HANDLING} without {@link MODEL_ONLY_ROLE_HANDLING}, in ladder order. */
export const userRoleHandlingSchema = roleHandlingSchema.exclude(MODEL_ONLY_ROLE_HANDLING);
export type UserRoleHandling = z.infer<typeof userRoleHandlingSchema>;
export const USER_ROLE_HANDLING: readonly UserRoleHandling[] = userRoleHandlingSchema.options;

/** Where a level lets a delivered `system` row sit: wherever the model takes one, only in its legal slot, or
 *  nowhere (every system row folds). */
export const SYSTEM_ROW_PLACEMENTS = ["anywhere", "slot", "fold"] as const;
export type SystemRowPlacement = (typeof SYSTEM_ROW_PLACEMENTS)[number];

export const SYSTEM_ROW_PLACEMENT: Readonly<Record<RoleHandling, SystemRowPlacement>> = {
  none: "anywhere",
  merge: "anywhere",
  slotted: "slot",
  "semi-strict": "fold",
  strict: "fold",
};

/** An inclusive numeric range — the ONE place a knob's bounds live; the client reads them for slider
 *  min/max and never re-hardcodes them. */
export const rangeSchema = z.object({ min: z.number(), max: z.number() });
export type Range = z.infer<typeof rangeSchema>;

/** THE HOME of the NUMERIC sampling knobs: each is a preset field (`UserIntent`), a capability `Range`, a
 *  resolved value and a drop-warning knob name under the same key. The first eight are the hosted-API set; the
 *  rest are the local-server samplers (llama.cpp, KoboldCpp) a model reaches only through a row that states
 *  them. A new member fails `tsc` at the capability shape below, the funnel, the editor catalog and the
 *  wire spelling table until each names it; the wire's body list ({@link BODY_SAMPLER_KNOBS}) derives from it. */
export const SAMPLING_RANGE_KNOBS = [
  "temperature",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "repetitionPenalty",
  "minP",
  "topA",
  "repetitionPenaltyRange",
  "typicalP",
  "topNSigma",
  "xtcProbability",
  "xtcThreshold",
  "dryMultiplier",
  "dryBase",
  "dryAllowedLength",
  "dryPenaltyLastN",
  "mirostatMode",
  "mirostatTau",
  "mirostatEta",
  "dynatempRange",
  "dynatempExponent",
  "smoothingFactor",
  "smoothingCurve",
  "adaptiveTarget",
  "adaptiveDecay",
  "minKeep",
] as const;
export type SamplingRangeKnob = (typeof SAMPLING_RANGE_KNOBS)[number];

const samplingRangeShape = {
  temperature: rangeSchema.optional(),
  topP: rangeSchema.optional(),
  topK: rangeSchema.optional(),
  frequencyPenalty: rangeSchema.optional(),
  presencePenalty: rangeSchema.optional(),
  repetitionPenalty: rangeSchema.optional(),
  minP: rangeSchema.optional(),
  topA: rangeSchema.optional(),
  repetitionPenaltyRange: rangeSchema.optional(),
  typicalP: rangeSchema.optional(),
  topNSigma: rangeSchema.optional(),
  xtcProbability: rangeSchema.optional(),
  xtcThreshold: rangeSchema.optional(),
  dryMultiplier: rangeSchema.optional(),
  dryBase: rangeSchema.optional(),
  dryAllowedLength: rangeSchema.optional(),
  dryPenaltyLastN: rangeSchema.optional(),
  mirostatMode: rangeSchema.optional(),
  mirostatTau: rangeSchema.optional(),
  mirostatEta: rangeSchema.optional(),
  dynatempRange: rangeSchema.optional(),
  dynatempExponent: rangeSchema.optional(),
  smoothingFactor: rangeSchema.optional(),
  smoothingCurve: rangeSchema.optional(),
  adaptiveTarget: rangeSchema.optional(),
  adaptiveDecay: rangeSchema.optional(),
  minKeep: rangeSchema.optional(),
} satisfies Record<SamplingRangeKnob, z.ZodOptional<typeof rangeSchema>>;

/** The sampling knobs a capability states with a boolean: the value is not a number to clamp. `bannedStrings` is
 *  the phrase ban, `banEos` keeps the model from ending its reply. */
const SAMPLING_FLAG_KNOBS = ["seed", "logitBias", "stop", "drySequenceBreakers", "bannedStrings", "banEos"] as const;

/** Every sampler a request can carry as one keyed value; each has one wire spelling per server. */
export const SAMPLER_KNOBS = [...SAMPLING_RANGE_KNOBS, ...SAMPLING_FLAG_KNOBS] as const;
export type SamplerKnob = (typeof SAMPLER_KNOBS)[number];

/** The sampler stages a server can run in a chosen order (llama.cpp `samplers`, KoboldCpp `sampler_order`).
 *  `penalties` is the repetition stage (repetition, presence and frequency together on llama.cpp). */
export const SAMPLER_STAGES = ["penalties", "dry", "topNSigma", "topK", "topA", "typicalP", "topP", "minP", "xtc", "temperature", "adaptiveP"] as const;
export type SamplerStage = (typeof SAMPLER_STAGES)[number];

/** A knob that acts only where its stage runs in the chain (llama.cpp applies adaptive-P only when `adaptive_p` is
 *  in `samplers`). Where the server orders that stage, a set knob makes the order ride even when the preset stores
 *  none, so the server's default chain with the stage is sent. */
export const SAMPLER_KNOB_STAGES: Readonly<Partial<Record<SamplingRangeKnob, SamplerStage>>> = { adaptiveTarget: "adaptiveP" };
/** A stage that picks the token rather than narrowing the candidates, as a server's final draw does: the server
 *  runs it after every other stage, wherever an order lists it (llama.cpp common/sampling.cpp appends adaptive-P). */
export const TERMINAL_SAMPLER_STAGES: readonly SamplerStage[] = ["adaptiveP"];
export const samplerStageSchema = z.enum(SAMPLER_STAGES) satisfies z.ZodType<SamplerStage>;
/** A stage order, each stage at most once: a repeat would put one token on the wire twice. The shape a
 *  capability states and a preset stores. */
export const samplerOrderSchema = z
  .array(samplerStageSchema)
  .min(1)
  .refine((stages) => new Set(stages).size === stages.length, { message: "a sampler stage appears once" });

/** The sampling knobs a model exposes, each a `Range` or a boolean. `exclusive` names knob PAIRS the model
 *  rejects together (current Claude models refuse `temperature` + `top_p` in one request): the funnel keeps
 *  the first-listed and drops the other with `sampling_knob_conflict`. `samplerOrder` is the stages the server
 *  can order, in the server's own default order. */
export const samplingCapabilitySchema = z.object({
  ...samplingRangeShape,
  seed: z.boolean().optional(),
  logitBias: z.boolean().optional(),
  stop: z.boolean().optional(),
  drySequenceBreakers: z.boolean().optional(),
  bannedStrings: z.boolean().optional(),
  banEos: z.boolean().optional(),
  samplerOrder: samplerOrderSchema.optional(),
  exclusive: z.array(z.tuple([z.string(), z.string()])).optional(),
  /** The knobs this server's Mirostat branch does not run: while `mirostatMode` is on, Mirostat replaces them. They
   *  still ride, so the editor and the readout mark them rather than drop them. Absent ⇒ unstated. */
  mirostatSkips: z.array(z.enum(SAMPLER_KNOBS)).optional(),
});
export type SamplingCapability = z.infer<typeof samplingCapabilitySchema>;

/** The samplers the Vercel V4 call options model: the openai-compat wire hands these to the SDK. */
const V4_SAMPLER_KNOBS = ["temperature", "topP", "frequencyPenalty", "presencePenalty", "seed", "stop"] as const satisfies readonly SamplerKnob[];
type V4SamplerKnob = (typeof V4_SAMPLER_KNOBS)[number];

function ridesBody(knob: SamplerKnob): knob is Exclude<SamplerKnob, V4SamplerKnob> {
  return !V4_SAMPLER_KNOBS.some((modelled) => modelled === knob);
}

/** The samplers whose request-body key the openai-compat wire spells itself: every sampler the V4 call options
 *  do not model ({@link V4_SAMPLER_KNOBS}). `@ai-sdk/openai-compatible` drops a V4 `topK`, so it rides here too.
 *  Derived from {@link SAMPLER_KNOBS}, so a new knob rides the body without a second list to keep. */
export const BODY_SAMPLER_KNOBS: readonly Exclude<SamplerKnob, V4SamplerKnob>[] = SAMPLER_KNOBS.filter(ridesBody);

export const reasoningCapabilitySchema = z.object({
  mode: reasoningModeSchema,
  /** The on/off axis (NOT `effort:'none'`). */
  enabled: z.boolean(),
  effortLevels: z.array(effortLevelSchema).optional(),
  budgetRange: rangeSchema.optional(),
  displayModes: z.array(reasoningDisplayModeSchema).optional(),
  /** Reasoning cannot be disabled — an `effort:'none'` intent is CLAMPED up at the funnel, never a 400. */
  mandatory: z.boolean().optional(),
  /** How an off turn is spelled on this model ({@link REASONING_OFF_MODES}). Absent ⇒ `disabled`. A `mandatory`
   *  route never reaches it: its off clamps up first. */
  offMode: reasoningOffModeSchema.optional(),
  /** The samplers the model takes only on a turn that sends reasoning off (OpenAI's GPT-5.1 and later refuse
   *  `temperature` and `top_p` at any other effort). A turn that reasons, or leaves the effort unset, drops them
   *  with `sampling_knob_dropped`. Kept here rather than in `sampling` so a tier that restates the sampler set
   *  cannot erase the refusal. */
  offOnlySamplers: z.array(z.enum(SAMPLER_KNOBS)).optional(),
  /** The catalog's own default (OpenRouter `default_enabled` / `default_effort`). It fills an unset effort only
   *  on a NON-adaptive model; an adaptive model takes the house default instead (`ADAPTIVE_DEFAULT_EFFORT`,
   *  `@orb/inference`'s resolve contract). */
  defaultEnabled: z.boolean().optional(),
  defaultEffort: effortLevelSchema.optional(),
  /** What a REPLAYED prior reasoning block may carry on this wire (§8.8). Rides `EVIDENCE_TIERS` like every
   *  other cell, so a curated family default is overridable by a dated `measured/*` row and by the user's own
   *  `declared` block. Absent ⇒ {@link REASONING_REPLAY_FLOOR}. */
  replay: reasoningReplayModeSchema.optional(),
  /** Replayed thinking is bound to the conversation prefix: a block whose earlier system, tools or messages
   *  changed is refused unless the request asks the API to drop it (`drop_block`). */
  prefixBound: z.boolean().optional(),
  /** A prefix edit before a carried thinking block cannot fail this route's turn: the wire asks the API to drop
   *  the block (`drop_block`), or the route's runtime builds its own requests and carries none of ours. Absent ⇒
   *  false, so a prefix-bound model on the route keeps its thinking inside one turn (`carryReasoning: tool-chain`). */
  prefixEditSafe: z.boolean().optional(),
  supportsMaxTokens: z.boolean().optional(),
});
export type ReasoningCapability = z.infer<typeof reasoningCapabilitySchema>;

/** Turn/message-array capabilities, keyed on (wire-shape × model). Every cell is MEASURED or fail-closed
 *  (D68/D69): absent `turns` ⇒ `TURNS_FLOOR`. */
export const turnsCapabilitySchema = z.object({
  /** The wire continues a DELIVERED trailing-assistant row. `true` authorizes the transport to send its
   *  continuation spelling (`features.prefill`); a template-driven engine that lacks it silently renders
   *  the row as a COMPLETED prior turn, an Anthropic wire hard-400s. */
  assistantPrefill: z.boolean(),
  /** MEASURED: the model takes a `system` row that ENDS the delivered history (after a user row). */
  midConversationSystem: z.boolean(),
  /** MEASURED: the model takes a `system` row INSIDE the delivered history (before an assistant row). A sibling
   *  fact, never inferred from `midConversationSystem`: one wire can take the tail and refuse mid-array. It gates
   *  an injection's delivery and nothing about a canon row's role (the narrator mapping is owner-ruled out). */
  historySystemRows: z.boolean(),
  /** The least strict {@link ROLE_HANDLING} level this (model × wire) takes. A model that takes a system row
   *  only in its legal slot states `slotted`. */
  roleHandlingFloor: roleHandlingSchema,
  /** Explicit prompt caching (a rolling breakpoint pair + per-block cache_control) is worth placing. */
  explicitPromptCache: z.boolean(),
  /** Per-model minimum cacheable prefix; `CACHE_MIN_FLOOR` when absent. */
  cacheMinTokens: z.number().int().positive().optional(),
  /** The route fixes cache retention; a different requested TTL is reported and clamped. */
  fixedCacheTtl: z.enum(PROMPT_CACHE_TTLS).optional(),
  /** Whether explicit markers default on when the connection stores no preference. Automatic caching is independent. */
  promptCacheDefaultEnabled: z.boolean().optional(),
  /** The wire honours a per-row `clearAt: "next_user_message"` on a mid-conversation system row
   *  (`@ai-sdk/anthropic`'s beta) — advertised by the curated row, forwarded by the wire converter. */
  clearAt: z.boolean().optional(),
});
export type TurnsCapability = z.infer<typeof turnsCapabilitySchema>;

/** The `turns` cells a preset's message handling and a continue read, whose provenance synthesis records
 *  (`turnsEstimated`): an unmeasured model must not clamp a user's choice to a guess. */
export const ESTIMABLE_TURNS = [
  "assistantPrefill",
  "midConversationSystem",
  "historySystemRows",
  "roleHandlingFloor",
] as const satisfies readonly (keyof TurnsCapability)[];
export type EstimableTurn = (typeof ESTIMABLE_TURNS)[number];

export const generationCapabilitySchema = z.object({
  reasoning: reasoningCapabilitySchema,
  sampling: samplingCapabilitySchema,
  /** The value the server itself runs a sampler at when a request leaves it unset, where the server
   *  advertises one (llama.cpp `/props` `default_generation_settings.params`, an Ollama Modelfile's
   *  `PARAMETER` lines). Display only: an unset knob never rides the wire. Kept outside `sampling` because
   *  `sampling` is a stated set that replaces whole, and a tier that only knows defaults must not erase it. */
  samplingDefaults: z.partialRecord(z.enum(SAMPLING_RANGE_KNOBS), z.number()).optional(),
  /** The value the route itself sends for a sampler the request leaves unset (Ollama's `/v1` sends `temperature`
   *  and `top_p` 1.0), which the server then runs in place of its own default. Display only, like
   *  `samplingDefaults`, and read before it: a server's advertised default never reaches a turn on this route. */
  routeSamplingDefaults: z.partialRecord(z.enum(SAMPLING_RANGE_KNOBS), z.number()).optional(),
  verbosity: z.array(verbositySchema).optional(),
  /** What a chat turn may CARRY. `image` gates the multimodal send, `video` likewise (#317); `audio`/`file`
   *  are captured truth no consumer sends yet. */
  input: z.array(modalitySchema),
  /** Present ⇒ accepts `tools[]`. `silencesProse` = MEASURED: attaching tools suppresses the assistant's
   *  prose on this (model × wire) — local vLLM's Qwen3-VL wrote 0 chars on 36/36 tool-attached turns. Absent
   *  `silencesProse` ⇒ the wire CO-EMITS (the hosted 6/6). Read through `coEmitsProseWithTools`.
   *
   *  `requiredChoice: false` / `namedChoice: false` = a forced tool choice of that form (`required`, or a named
   *  function — Anthropic's `any` / `tool`) does not reach the model as forced: Anthropic answers both with a
   *  400, llama.cpp runs a named choice as `auto`, Ollama and KoboldCpp take neither. A wire downgrades that
   *  form to `auto` loudly, and the structured vehicle avoids the named tool. Absent ⇒ ACCEPTED, deliberately not
   *  fail-closed: `required` is live-verified and load-bearing on the vLLM and OpenRouter routes (the rpg state
   *  round). Read through `acceptsRequiredToolChoice` / `acceptsNamedToolChoice`.
   *
   *  `noneChoice: false` = a `none` choice does not reach the model either (Ollama, and KoboldCpp, whose chat route
   *  reads it as no constraint), so a turn that asks for none offers no tools there. `parallelControl: false` = a
   *  request's `parallel_tool_calls: false` reaches no model on this server, so it is dropped by name. Absent ⇒
   *  honoured, like the forced forms. Read through `acceptsNoneToolChoice` / `honoursParallelControl`. */
  tools: z
    .object({
      parallel: z.boolean(),
      silencesProse: z.boolean().optional(),
      requiredChoice: z.boolean().optional(),
      namedChoice: z.boolean().optional(),
      noneChoice: z.boolean().optional(),
      parallelControl: z.boolean().optional(),
    })
    .optional(),
  output: z.object({
    maxTokens: rangeSchema,
    /** `maxTokens` is the kind floor's guess: no tier above it stated a cap. A surface showing it must say so. */
    maxTokensEstimated: z.boolean().optional(),
    /** Accepts `response_format`/JSON-schema constrained output — separate from `tools`. */
    structured: z.boolean().optional(),
    /** The wire subset whose grammar ceilings (`WireSubset.limits`) this model's vendor enforces, whichever wire
     *  class carries the request. Absent ⇒ no stated ceiling. The structured planner checks every request
     *  against them before the call. */
    structuredLimitsFrom: z.enum(WIRE_SCHEMA_MODES).optional(),
    /** Per-model ceilings merged over `structuredLimitsFrom`'s defaults field by field: a model that differs from
     *  its vendor's table is a row, never a branch. */
    structuredLimits: z
      .object({
        maxOptionalProps: z.number().int().nonnegative().optional(),
        maxUnionProps: z.number().int().nonnegative().optional(),
        maxStrictTools: z.number().int().nonnegative().optional(),
        maxObjectProps: z.number().int().nonnegative().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        maxEnumValues: z.number().int().nonnegative().optional(),
        maxNameChars: z.number().int().nonnegative().optional(),
      })
      .optional(),
    /** What the model can PRODUCE. `image` here is what makes a chat model answer with pictures (§6.7) and
     *  what `generateImage` requires. */
    modalities: z.array(modalitySchema),
  }),
  /** Image-GENERATION input arms: an init/reference image on the call (`edit-image`, `generate-picture`). */
  imageEdit: z.boolean().optional(),
  imageDetail: z.boolean().optional(),
  imageReferences: z.boolean().optional(),
  /** `window` = usable context in tokens. `windowEstimated` marks a FALLBACK GUESS (cold catalog, no
   *  declared window) — the history FIT still runs against it, but a "used / window" surface must say so. */
  context: z.object({
    window: z.number(),
    windowEstimated: z.boolean().optional(),
    /** The route sends the window with each request (Ollama's native `num_ctx`), so a preset's Max context tokens
     *  sets the window the server runs, up to `max`, the model's trained maximum. Absent (another route, or a server
     *  that states no trained maximum) ⇒ the window stands and the preset can only lower the fit. Read through
     *  `windowForPreset`. */
    settable: z.object({ max: z.number() }).optional(),
  }),
  /** The catalog handed a modality string the parser did not know (§5.4's unknown-value rule). */
  modalitiesEstimated: z.boolean().optional(),
  moderated: z.boolean().optional(),
  turns: turnsCapabilitySchema.optional(),
  /** The `turns` cells no evidence tier stated, so they hold {@link TURNS_FLOOR}'s fail-closed guess. A preset's
   *  role handling is clamped only against a STATED floor (`turnsLevelFor`), and an estimated prefill cell does
   *  not block a continue. Absent ⇒ every cell was stated. */
  turnsEstimated: z.array(z.enum(ESTIMABLE_TURNS)).optional(),
});
export type GenerationCapability = z.infer<typeof generationCapabilitySchema>;

/** The conservative `turns` cell every model defaults to when no per-shape cell was measured. */
export const TURNS_FLOOR: TurnsCapability = {
  assistantPrefill: false,
  midConversationSystem: false,
  historySystemRows: false,
  roleHandlingFloor: "strict",
  explicitPromptCache: false,
};

/** The fail-closed reasoning-replay rung for a model whose descriptor states none: send nothing back. */
export const REASONING_REPLAY_FLOOR: ReasoningReplayMode = "none";

/** The fail-closed minimum cacheable-prefix floor (tokens). */
export const CACHE_MIN_FLOOR = 4096;

/** The generation KIND floor — text in, text out, no reasoning, no sampling ranges (the funnel drops every
 *  knob with a warning), a guessed window. NO default model rides here (F16). */
export const GENERATION_FLOOR: GenerationCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  input: ["text"],
  output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] },
  context: { window: 8192, windowEstimated: true },
  turns: { ...TURNS_FLOOR },
};
