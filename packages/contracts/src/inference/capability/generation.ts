// The GENERATION capability — what a chat/summarize/structured/generateImage model honours, keyed by
// (model × wire-shape), produced once by the package's synthesis and read by the funnel, the assembly and
// the client's capability panel. The modality booleans of the old `ModelCapability` (`input.{vision, video,
// audio, file}`, `outputModalities: string[]`) are `Modality[]` here; every knob a model does not list is
// simply ABSENT (no silent no-ops); the reasoning/sampling/verbosity/output/context/turns axes are kept
// verbatim from the shape they replace. The axis tuples below are THE HOME — `@orb/contracts/connection`
// re-exports them until it is deleted with the source axis.

import { z } from "zod";
import { modalitySchema } from "../modalities.ts";

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

/** The sampling knobs a model exposes, each a `Range` or a boolean. `exclusive` names knob PAIRS the model
 *  rejects together (current Claude models refuse `temperature` + `top_p` in one request): the funnel keeps
 *  the first-listed and drops the other with `sampling_knob_conflict`. */
export const samplingCapabilitySchema = z.object({
  temperature: rangeSchema.optional(),
  topP: rangeSchema.optional(),
  topK: rangeSchema.optional(),
  frequencyPenalty: rangeSchema.optional(),
  presencePenalty: rangeSchema.optional(),
  repetitionPenalty: rangeSchema.optional(),
  minP: rangeSchema.optional(),
  topA: rangeSchema.optional(),
  seed: z.boolean().optional(),
  logitBias: z.boolean().optional(),
  stop: z.boolean().optional(),
  exclusive: z.array(z.tuple([z.string(), z.string()])).optional(),
});
export type SamplingCapability = z.infer<typeof samplingCapabilitySchema>;

export const reasoningCapabilitySchema = z.object({
  mode: reasoningModeSchema,
  /** The on/off axis (NOT `effort:'none'`). */
  enabled: z.boolean(),
  effortLevels: z.array(effortLevelSchema).optional(),
  budgetRange: rangeSchema.optional(),
  displayModes: z.array(reasoningDisplayModeSchema).optional(),
  /** Reasoning cannot be disabled — an `effort:'none'` intent is CLAMPED up at the funnel, never a 400. */
  mandatory: z.boolean().optional(),
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
  /** The wire honours a per-row `clearAt: "next_user_message"` on a mid-conversation system row
   *  (`@ai-sdk/anthropic`'s beta) — advertised by the curated row, forwarded by the wire converter. */
  clearAt: z.boolean().optional(),
});
export type TurnsCapability = z.infer<typeof turnsCapabilitySchema>;

export const generationCapabilitySchema = z.object({
  reasoning: reasoningCapabilitySchema,
  sampling: samplingCapabilitySchema,
  verbosity: z.array(verbositySchema).optional(),
  /** What a chat turn may CARRY. `image` gates the multimodal send, `video` likewise (#317); `audio`/`file`
   *  are captured truth no consumer sends yet. */
  input: z.array(modalitySchema),
  /** Present ⇒ accepts `tools[]`. `silencesProse` = MEASURED: attaching tools suppresses the assistant's
   *  prose on this (model × wire) — local vLLM's Qwen3-VL wrote 0 chars on 36/36 tool-attached turns. Absent
   *  `silencesProse` ⇒ the wire CO-EMITS (the hosted 6/6). Read through `coEmitsProseWithTools`.
   *
   *  `forcedChoice: false` = the model REJECTS a forced tool choice (`required`/`tool` — Anthropic's `any`/`tool`)
   *  with a 400, so a wire downgrades it to `auto` and the structured vehicle avoids the forced tool. Absent ⇒
   *  ACCEPTED, deliberately not fail-closed: `required` is live-verified and load-bearing on the vLLM and
   *  OpenRouter routes (the rpg state round), and only a documented model-specific refusal states `false`.
   *  Read through `acceptsForcedToolChoice`. */
  tools: z.object({ parallel: z.boolean(), silencesProse: z.boolean().optional(), forcedChoice: z.boolean().optional() }).optional(),
  output: z.object({
    maxTokens: rangeSchema,
    /** Accepts `response_format`/JSON-schema constrained output — separate from `tools`. */
    structured: z.boolean().optional(),
    /** What the model can PRODUCE. `image` here is what makes a chat model answer with pictures (§6.7) and
     *  what `generateImage` requires. */
    modalities: z.array(modalitySchema),
  }),
  /** Image-GENERATION input arms: an init/reference image on the call (`edit-image`, `generate-picture`). */
  imageEdit: z.boolean().optional(),
  imageReferences: z.boolean().optional(),
  /** `window` = usable context in tokens. `windowEstimated` marks a FALLBACK GUESS (cold catalog, no
   *  declared window) — the history FIT still runs against it, but a "used / window" surface must say so. */
  context: z.object({ window: z.number(), windowEstimated: z.boolean().optional() }),
  /** The catalog handed a modality string the parser did not know (§5.4's unknown-value rule). */
  modalitiesEstimated: z.boolean().optional(),
  moderated: z.boolean().optional(),
  turns: turnsCapabilitySchema.optional(),
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
