// The connection cross-boundary wire surface — SELECTION axes (which api/source/model a turn or role
// runs as) plus the capability DESCRIPTOR both the per-runner translator and client panel read.
// `connection` is selection, not execution: the sealed `runner`/`family` vocab stays inside
// `infra/providers`; this contract speaks only the user vocab `{api, source, model}` + `ModelCapability`.
// `connection` re-exports `CredentialSource` verbatim (never redeclared) — routing's `source` IS the
// credential source. (PD-12 closed: the BYO model profile is the flat `model`/`contextWindow` metadata
// pair on the `custom_openai` credential — no nested `CustomModelProfile` type; the runner reads the
// resolved `ModelCapability`, never a baked profile object.)

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { z } from "zod";
import type { CredentialSource, ResolvedCredential } from "#credentials";

// The chat-completion machinery a turn is addressed by — distinct from `CredentialSource` (one source can
// serve several apis). Every dispatch switch over `api` uses `assertNever` for exhaustiveness.
export const CHAT_APIS = ["agent-sdk", "chat-completions", "responses"] as const;
export type ChatApi = (typeof CHAT_APIS)[number];
export const chatApiSchema = z.enum(CHAT_APIS);

/** Verbatim re-export of {@link CredentialSource} — not a second tuple (D31). */
export type { CredentialSource } from "#credentials";

/** OpenRouter "provider routing" preferences — the request's `provider` object. OpenRouter owns and
 *  evolves this wire shape, so the model is lenient: known knobs are typed+optional, `.loose()` keeps
 *  any not-yet-modelled field. Snake_case fields are OpenRouter's own wire names. */
export const openRouterProviderRoutingSchema = z
  .object({
    /** Ordered provider preference, e.g. ["Anthropic"] — pinned so `cache_control` is honored. */
    order: z.array(z.string()),
    allow_fallbacks: z.boolean(),
    require_parameters: z.boolean(),
    data_collection: z.enum(["allow", "deny"]),
    /** Restrict to only these providers. */
    only: z.array(z.string()),
    /** Exclude these providers. */
    ignore: z.array(z.string()),
    quantizations: z.array(z.string()),
    sort: z.enum(["price", "throughput", "latency"]),
    max_price: z.record(z.string(), z.unknown()),
    /** MODEL-level fallback chain (distinct from provider `allow_fallbacks`, which is same-model): when the
     *  primary model is unavailable/errors, OpenRouter tries these in order. Maps to the wire's top-level
     *  `models[]`. Homed here (the one routing-prefs shape), NOT a sibling field. */
    models: z.array(z.string()),
  })
  .partial()
  .loose();

export type OpenRouterProviderRouting = z.infer<typeof openRouterProviderRoutingSchema>;

// Reasoning/sampling/verbosity/output/context are SEPARATE axes; produced once per `(model, backend)`
// by `resolveModelCapability`, consumed by both the infra translator and the client panel.

/** How a model reasons — distinct from on/off (`reasoning.enabled`); `EFFORT_LEVELS` has no `'none'`. */
export const REASONING_MODES = ["none", "effort", "budget", "adaptive"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];
export const reasoningModeSchema = z.enum(REASONING_MODES);

/** The model's real effort levels, deliberately EXCLUDING `'none'` — the on/off decision is
 *  `reasoning.enabled`. `contracts/preset.EFFORT_LEVELS` derives from this set, never redeclares it. */
export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const effortLevelSchema = z.enum(EFFORT_LEVELS);

/** The verbosity axis (OpenAI) — a real, model-gated control, present only when the model honors it. */
export const VERBOSITY_LEVELS = ["low", "medium", "high"] as const;
export type Verbosity = (typeof VERBOSITY_LEVELS)[number];
export const verbositySchema = z.enum(VERBOSITY_LEVELS);

/** The Anthropic-only reasoning-display knob. */
export const REASONING_DISPLAY_MODES = ["summarized", "omitted"] as const;
export type ReasoningDisplayMode = (typeof REASONING_DISPLAY_MODES)[number];
export const reasoningDisplayModeSchema = z.enum(REASONING_DISPLAY_MODES);

/** Adjacent-same-role handling floor. SHAPE's effective strategy is the stricter of the model/wire
 *  floor + the user knob (may go stricter, never looser), ordered `none`, `merge`, `semi-strict`, `strict`. */
export const ROLE_HANDLING = ["none", "merge", "semi-strict", "strict"] as const;
export type RoleHandling = (typeof ROLE_HANDLING)[number];
export const roleHandlingSchema = z.enum(ROLE_HANDLING);

/** An inclusive numeric range. The ONE place a knob's bounds live — the client panel reads these for
 *  slider min/max and never re-hardcodes them. */
export const rangeSchema = z.object({ min: z.number(), max: z.number() });
export type Range = z.infer<typeof rangeSchema>;

/** The capability descriptor for a resolved `(model, backend)`: a knob the model doesn't list is
 *  simply absent (no silent no-ops); the panel renders by iterating the descriptor. */
export const modelCapabilitySchema = z.object({
  reasoning: z.object({
    /** HOW the model reasons — distinct from on/off. */
    mode: reasoningModeSchema,
    /** The on/off axis (NOT `effort:'none'`). */
    enabled: z.boolean(),
    /** The model's real levels, when `mode === 'effort'`. */
    effortLevels: z.array(effortLevelSchema).optional(),
    /** The token budget range, when `mode === 'budget'`. */
    budgetRange: rangeSchema.optional(),
    /** Anthropic-only display knob. */
    displayModes: z.array(reasoningDisplayModeSchema).optional(),
    /** OpenRouter-advertised (R0): reasoning cannot be disabled — an `effort:'none'` intent is CLAMPED to
     *  the lowest supported effort at the funnel (never a silent 400). */
    mandatory: z.boolean().optional(),
    /** OpenRouter-advertised (R0): reasoning is ON by default when the client sets nothing (folded into
     *  `enabled`; carried as truth). */
    defaultEnabled: z.boolean().optional(),
    /** OpenRouter-advertised (R0): the model's OWN default effort — the funnel uses it beneath the
     *  quality-derived default (precedence: explicit user, then quality, then model defaultEffort, then house). */
    defaultEffort: effortLevelSchema.optional(),
    /** OpenRouter-advertised (R0): the model accepts `reasoning.max_tokens` (Anthropic-style budget) in
     *  addition to / instead of effort. Captured truth. */
    supportsMaxTokens: z.boolean().optional(),
  }),
  sampling: z.object({
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
  }),
  verbosity: z.array(verbositySchema).optional(),
  /** `vision` = accepts image content-parts (gates the multimodal send). `imageEdit` = accepts an
   *  init/reference image on the image-GENERATION call — distinct from `vision` (chat-input images).
   *  `file`/`audio`/`video` = the model accepts that input modality (OpenRouter advertises them; capability
   *  TRUTH now — absent ⇒ false, no consumer sends these parts yet). */
  input: z
    .object({
      vision: z.boolean(),
      imageEdit: z.boolean().optional(),
      file: z.boolean().optional(),
      audio: z.boolean().optional(),
      video: z.boolean().optional(),
    })
    .optional(),
  /** Present ⇒ accepts a `tools[]` request; `parallel` = may request several tool calls in one turn.
   *  Absent ⇒ no tool-calling (tool-call parts drop with a `tools_unsupported` warning). */
  tools: z.object({ parallel: z.boolean() }).optional(),
  /** `structured` = accepts `response_format`/JSON-schema constrained output — separate from `tools`. */
  output: z.object({ maxTokens: rangeSchema, structured: z.boolean().optional() }),
  context: z.object({ window: z.number(), supports1M: z.boolean().optional() }),
  /** The model's top provider applies content moderation (OpenRouter `top_provider.is_moderated`) — a
   *  prompt may be blocked (surfaces as the `moderation` provider error). Truth only; absent ⇒ not
   *  moderated / unknown (R2). */
  moderated: z.boolean().optional(),
  /** Turn/message-array capabilities, keyed on (wire-shape × model). Absent ⇒ `TURNS_FLOOR`. */
  turns: z
    .object({
      /** The wire accepts a DELIVERED trailing-assistant message as prefill; false ⇒ SHAPE normalizes at
       *  delivery (a false-model receiving one hard-400s). Per-model, per-transport. */
      assistantPrefill: z.boolean(),
      /** A mid-conversation system-authority channel exists and this model honors it, placement-correct. */
      midConversationSystem: z.boolean(),
      /** The model/wire floor for adjacent-same-role handling; the user knob may go stricter, never looser. */
      roleHandlingFloor: roleHandlingSchema,
      /** Whether explicit prompt caching (rolling breakpoint pair + per-block cache_control) is worth
       *  placing on this (wire-shape × model). */
      explicitPromptCache: z.boolean(),
      /** Per-model minimum cacheable prefix (tokens) — below it a breakpoint burns a slot with no cache
       *  entry formed. Read only when `explicitPromptCache`; `CACHE_MIN_FLOOR` applies when absent. */
      cacheMinTokens: z.number().int().positive().optional(),
    })
    .optional(),
});
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

/** The conservative today-behavior `turns` cell every model defaults to when the resolver can't refine
 *  a per-shape cell. */
export const TURNS_FLOOR: NonNullable<ModelCapability["turns"]> = {
  assistantPrefill: false,
  midConversationSystem: false,
  roleHandlingFloor: "strict",
  explicitPromptCache: false,
} as const;

/** The fail-closed minimum cacheable-prefix floor (tokens) — the conservative default guarding a
 *  synthesized/unseeded `explicitPromptCache` arm without an exact `cacheMinTokens`. */
export const CACHE_MIN_FLOOR = 4096;

/** One normalized OpenRouter catalog model — the cross-boundary entry the client model picker reads.
 *  `id` is a plain string (OR ids are free-form; only the curated shortlist carries a brand). */
export const modelCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Context window in tokens, when reported. */
  contextLength: z.number().nullable(),
  /** USD per token (OpenRouter reports as strings — normalized to number here); null when unpriced. */
  promptPrice: z.number().nullable(),
  completionPrice: z.number().nullable(),
  /** Cache pricing — non-null iff the model has explicit prompt caching with cache pricing. */
  cacheReadPrice: z.number().nullable(),
  cacheWritePrice: z.number().nullable(),
  /** e.g. ["text", "image"] — for multimodal filtering. */
  inputModalities: z.array(z.string()),
  /** e.g. ["text", "image"] — what the model can PRODUCE; optional so old persisted snapshots parse. */
  outputModalities: z.array(z.string()).optional(),
  /** Generation params the model/provider accepts (e.g. "tools", "reasoning", "temperature"). */
  supportedParameters: z.array(z.string()),
  /** The top provider's advertised max completion tokens — the REAL per-model output cap (OpenRouter
   *  `top_provider.max_completion_tokens`). Null/absent when OR doesn't advertise it (older snapshots +
   *  models without the field), in which case the resolver degrades to the window-derived estimate. */
  maxCompletionTokens: z.number().nullable().optional(),
  /** The top provider applies content moderation (OpenRouter `top_provider.is_moderated`) — the resolver
   *  surfaces it as `ModelCapability.moderated` (R2). Absent on older snapshots. */
  isModerated: z.boolean().optional(),
  /** OpenRouter's advertised per-model reasoning metadata (its top-level `reasoning` object) — the
   *  per-model SOURCE OF TRUTH the resolver prefers over the hardcoded family table (R0). `supportedEfforts`
   *  is the model's real effort allowlist (null ⇒ no allowlist, all gateway efforts accepted); `mandatory`
   *  ⇒ reasoning can't be disabled; `defaultEnabled` ⇒ on when the client sets nothing. Null/absent when OR
   *  advertises no reasoning (⇒ family fallback; a no-reasoning family stays reasoning:none — never guessed). */
  reasoning: z
    .object({
      mandatory: z.boolean(),
      defaultEnabled: z.boolean().optional(),
      supportedEfforts: z.array(z.string()).nullable().optional(),
      /** The model's own default effort (OR's raw string; the resolver keeps it only when it maps to an
       *  `EffortLevel`). */
      defaultEffort: z.string().nullable().optional(),
      /** The model accepts `reasoning.max_tokens` (Anthropic-style). */
      supportsMaxTokens: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;

/** One normalized row from the Claude Agent SDK daemon's `supportedModels()` call — used to resolve a
 *  bare family alias or a stale curated id onto the daemon's current `resolvedModel`. SDK-free by
 *  construction; distinct from {@link ModelCatalogEntry} (a separate snapshot, never co-mingled). */
export const agentSdkModelSchema = z.object({
  /** The alias the daemon accepts in an API call (`sonnet`/`opus`/`haiku`, or a version-only id). */
  alias: z.string(),
  /** The canonical wire id `alias` resolves to today (`sonnet` → `claude-sonnet-5`). `null` when the
   *  daemon omits it. */
  resolvedModel: z.string().nullable(),
  displayName: z.string(),
  description: z.string(),
  /** Whether the model honors effort levels (the on/off axis for reasoning effort). */
  supportsEffort: z.boolean(),
  /** The model's real effort levels when `supportsEffort` — the daemon's `low..max` subset, no `'none'`. */
  effortLevels: z.array(effortLevelSchema),
  /** Whether Claude decides its own thinking depth (Opus-class adaptive thinking). */
  supportsAdaptiveThinking: z.boolean(),
});
export type AgentSdkModel = z.infer<typeof agentSdkModelSchema>;

/** The resolved `{api, model, credential, capability}` a turn or role runs as. The provider-source
 *  axis is carried by `credential.source`, so it is not duplicated as a separate field. Not a Zod
 *  schema: `credential` is the brand-protected {@link ResolvedCredential}. */
export interface ResolvedConnection {
  /** The protocol axis the turn is addressed by. */
  readonly api: ChatApi;
  /** The model id sent on the wire (curated-shortlist branded ids and OR plain ids both inhabit it). */
  readonly model: ModelId;
  /** From `credentials.resolve` — discriminated by `source` (the provider-source axis), brand-protected. */
  readonly credential: ResolvedCredential;
  /** The descriptor for this `(model, backend)` — the one source the panel + translator read. */
  readonly capability: ModelCapability;
}

/** The inference roles `connection.resolveRole` resolves a connection for. `resolveRole`'s dispatch is
 *  a mapped Record so a new role missing its resolver is a tsc error. */
export const ROUTING_ROLE_KEYS = ["chat", "embed", "rerank", "imageEmbed", "summarize", "generateImage"] as const;
export type RoutingRoleKey = (typeof ROUTING_ROLE_KEYS)[number];
export const routingRoleKeySchema = z.enum(ROUTING_ROLE_KEYS);

/** One per-role chat routing assignment — the shape of `UserSettings.routing.roleDefaults.chat` AND
 *  of the chat row's routing fields. Every field optional: falls through to the next layer. */
export interface RouteChatAssignment {
  readonly api?: ChatApi | undefined;
  readonly source?: CredentialSource | undefined;
  readonly model?: string | null | undefined;
  readonly providerRouting?: OpenRouterProviderRouting | undefined;
}

/** Why a chat's resolved connection CANNOT deterministically serve a turn — the honest-refusal cause the
 *  composer maps to a specific reason (#54). ENGINE-AGNOSTIC: `engine-off` is a local engine that is
 *  disabled/absent; `no-connection` is an unconfigured/incoherent connection (no credential row, a routing
 *  pairing with no backend); `unavailable` is the generic fallback (the resolved backend isn't wired).
 *  Deterministic-only — a configured hosted connection reads available and is never pre-flighted (a bad key
 *  still fails at send with the existing provider error). Client single-homes the reason copy per cause. */
export const CHAT_UNAVAILABLE_CAUSES = ["engine-off", "no-connection", "unavailable"] as const;
export type ChatUnavailableCause = (typeof CHAT_UNAVAILABLE_CAUSES)[number];
export const chatUnavailableCauseSchema = z.enum(CHAT_UNAVAILABLE_CAUSES);

/** The composer's pre-send availability signal for a chat's OWN resolved connection — "would
 *  `resolveChat → deriveRunner → requireBackend` succeed WITHOUT firing a turn or an API call?" `cause` is
 *  present iff `!available`. Not a turn/execution result — purely the deterministic serveability verdict. */
export const chatSendAvailabilitySchema = z.union([
  z.object({ available: z.literal(true) }),
  z.object({ available: z.literal(false), cause: chatUnavailableCauseSchema }),
]);
export type ChatSendAvailability = z.infer<typeof chatSendAvailabilitySchema>;

// The brand ENDS at the curated shortlist: OpenRouter ids are plain strings; only curated entries
// carry this brand. `isChatModelId` is the runtime discriminator.
declare const chatModelBrand: unique symbol;
export type ChatModelId = ModelId & { readonly [chatModelBrand]: true };

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = castId<ChatModelId>("claude-opus-4-8");

/** The OpenRouter default chat model — OpenRouter's auto-router; `pickOrModel` heals a null/rejected
 *  OR model id to this. */
export const DEFAULT_OR_CHAT_MODEL_ID: ModelId = castId<ModelId>("openrouter/auto");
