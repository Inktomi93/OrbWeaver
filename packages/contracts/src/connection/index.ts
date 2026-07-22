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
export const CHAT_APIS = ["agent-sdk", "chat-completions", "responses", "anthropic-messages"] as const;
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
   *  `imageIdentity` = the model honors an identity/FACE reference (`edit.references[]`) as a dedicated
   *  identity-lock channel (IPAdapter-FaceID / PuLID — comfyui-control §4.6/C6), distinct from a plain
   *  img2img init: the B3 avatar-reference gate routes the avatar into `references[]` (not `image`) when this
   *  is advertised, so the local arm conditions on the FACE rather than denoising the whole avatar. Absent ⇒
   *  the arm has no identity lock (a curated Anima role, a hosted arm) — the reference falls back to img2img.
   *  `file`/`audio`/`video` = the model accepts that input modality (OpenRouter advertises them; capability
   *  TRUTH now — absent ⇒ false, no consumer sends these parts yet). */
  input: z
    .object({
      vision: z.boolean(),
      imageEdit: z.boolean().optional(),
      imageIdentity: z.boolean().optional(),
      file: z.boolean().optional(),
      audio: z.boolean().optional(),
      video: z.boolean().optional(),
    })
    .optional(),
  /** Present ⇒ accepts a `tools[]` request; `parallel` = may request several tool calls in one turn.
   *  Absent ⇒ no tool-calling (tool-call parts drop with a `tools_unsupported` warning). */
  tools: z.object({ parallel: z.boolean() }).optional(),
  /** Image-generation diffusion knobs the source's runner honors (MA-8/D96 — capture-and-use per D95). A
   *  knob ABSENT ⇒ the runner ignores it with honesty (the capability says it's unsupported, so a request
   *  carrying it is never silently dropped — the panel simply doesn't offer it). Only the `comfyui` source
   *  advertises these today (hosted Venice/OpenRouter image models expose no diffusion knobs). `sampler`/
   *  `scheduler`/`checkpoint` are booleans (the knob EXISTS); the live enum VALUES come from the separate
   *  `probeImageEngine` verb (`/object_info`), never from this static descriptor. */
  imageGen: z
    .object({
      steps: rangeSchema.optional(),
      cfg: rangeSchema.optional(),
      sampler: z.boolean().optional(),
      scheduler: z.boolean().optional(),
      seed: z.boolean().optional(),
      checkpoint: z.boolean().optional(),
      /** The curated-role QUALITY TIER lever (comfyui-control §C8): present ⇒ this role's family has a
       *  max-quality `advanced` bundle the `quality:'high'` knob unlocks (detailers/hires/ultimate-upscale);
       *  absent ⇒ no advanced tier (the panel offers no quality toggle). Boolean presence, like `sampler`. */
      quality: z.boolean().optional(),
    })
    .optional(),
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
       *  delivery (a false-model receiving one hard-400s). Per-model, per-transport on anthropic-messages. */
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
export const ROUTING_ROLE_KEYS = ["chat", "agent", "embed", "rerank", "imageEmbed", "summarize", "generateImage"] as const;
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

// The brand ENDS at the curated shortlist: OpenRouter ids are plain strings; only curated entries
// carry this brand. `isChatModelId` is the runtime discriminator.
declare const chatModelBrand: unique symbol;
export type ChatModelId = ModelId & { readonly [chatModelBrand]: true };

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = castId<ChatModelId>("claude-opus-4-8");

/** The OpenRouter default chat model — OpenRouter's auto-router; `pickOrModel` heals a null/rejected
 *  OR model id to this. */
export const DEFAULT_OR_CHAT_MODEL_ID: ModelId = castId<ModelId>("openrouter/auto");

// ── The ComfyUI live-probe tri-state (MA-8/D96) ──────────────────────────────────────────────────────
// The client DISCRIMINATES on `state` (D83 — named contract vocabulary, never message-text matching): a
// reachable engine WITH checkpoints (`ok-with-models`), a reachable engine with ZERO checkpoints installed
// (`ok-but-empty` — a REAL first-class product state, not an error), or an unreachable/unconfigured engine
// (`engine-off`). The `probeImageEngine` verb does one `GET {baseUrl}/object_info` and maps the node-catalog
// shape onto this union; the enum VALUES (samplers/schedulers/checkpoints/vaes) come from the live catalog,
// never a static table. `checkpoints` is the union of `CheckpointLoaderSimple.ckpt_name` + `UNETLoader.unet_name`.

/** The named tri-state a ComfyUI reachability probe resolves to. */
export const COMFYUI_PROBE_STATES = ["ok-with-models", "ok-but-empty", "engine-off"] as const;
export type ComfyuiProbeState = (typeof COMFYUI_PROBE_STATES)[number];

/** The live node-catalog a reachable ComfyUI advertises via `/object_info`: the display-clean sampler,
 *  scheduler, checkpoint, and VAE names the model-picker offers. */
export const comfyuiCatalogSchema = z.object({
  samplers: z.array(z.string()),
  schedulers: z.array(z.string()),
  checkpoints: z.array(z.string()),
  vaes: z.array(z.string()),
});
export type ComfyuiCatalog = z.infer<typeof comfyuiCatalogSchema>;

/** One catalogued LoRA a curated role can attach, as the picker surfaces it (comfyui-control §C8 / §4.5) — the
 *  STATIC reference slice (name/filename/trigger words/recommended weight). Populated by the arm from the ported
 *  `lora_catalog` (the runtime Civitai auto-download does NOT port — a missing LoRA is an honest refusal). */
export const comfyuiRoleLoraSchema = z.object({
  slug: z.string(),
  name: z.string(),
  filename: z.string(),
  category: z.string(),
  triggerWords: z.array(z.string()),
  recommendedWeight: z.number(),
});
export type ComfyuiRoleLora = z.infer<typeof comfyuiRoleLoraSchema>;

/** A curated role's PROMPT GUIDE (comfyui-control §4.5, the 'UI money-shot') — the model's prompt-style hint +
 *  scaffolds + the sampling hints, ported from the kit's sourced `prompt_guide`. Populated by the arm's
 *  `guideFor`; a reference surface the picker shows, never a lock (the guide-exact knobs live in the family). */
export const comfyuiRoleGuideSchema = z.object({
  displayName: z.string(),
  promptStyle: z.string(),
  qualityPrefix: z.string(),
  positiveScaffold: z.string(),
  negativeScaffold: z.string(),
  cfgHint: z.string(),
  stepsHint: z.string(),
  promptingNotes: z.string(),
  examplePrompt: z.string(),
});
export type ComfyuiRoleGuide = z.infer<typeof comfyuiRoleGuideSchema>;

/** One curated `orbgen:<role>` mode as the ComfyUI picker surfaces it (comfyui-control spec §4.2/§4.4/§4.5, C5).
 *  `id` is the `model`-slot value (`orbgen:<role>`) the connection persists; `role`/`label`/`arch` are display.
 *  `available` is GROUNDED against the live catalog + registered node classes (never a static assumption — the
 *  `plan-for-small-hardware` honest-degrade posture); when false, `missing` NAMES the absent pieces (the required
 *  checkpoint/UNET filename and/or the missing node classes) so the refusal is honest and the picker can render
 *  the disabled option with its reason, never a silent substitute. `imageGen` is the role family's honored
 *  diffusion-knob surface (the panel offers only advertised knobs — the capability-truth contract). `nsfw` badges
 *  the explicit roles for the D61 consent gate (surfaced default-off, never laundered, never silently dropped). */
export const comfyuiRoleAvailabilitySchema = z.object({
  id: z.string(),
  role: z.string(),
  label: z.string(),
  arch: z.string(),
  nsfw: z.boolean(),
  available: z.boolean(),
  missing: z.array(z.string()),
  imageGen: modelCapabilitySchema.shape.imageGen,
  /** Whether this role's family accepts an init/reference image (`edit.image`/`references`) — true for every
   *  curated role whose base is available (they all do img2img), the §4.6 honest-refusal contract (a raw
   *  checkpoint / hosted arm advertises no edit). Convenience OR of the granular {@link levers}. */
  imageEdit: z.boolean(),
  /** Per-OPTIONAL-lever availability, GROUNDED against the live node classes (comfyui-control spec §4.4/§4.6/
   *  §4.12.4, C6): a lever is `true` only when its family honors that method AND every node class the lever's
   *  build emits is registered (flux inpaint additionally needs the Fill UNET in the catalog). A `false` lever
   *  is the honest per-lever refusal the picker renders — the runner would build the graph, but the missing
   *  node makes it a typed refusal, never a silent no-op. `img2img` needs only core nodes, so it tracks base
   *  availability; `identity` is sdxl/flux only (Anima has no identity lock). */
  levers: z.object({
    img2img: z.boolean(),
    inpaint: z.boolean(),
    identity: z.boolean(),
    pose: z.boolean(),
  }),
  /** The role's sourced PROMPT GUIDE (comfyui-control §4.5) — the prompt-style hint + scaffolds the picker shows
   *  so the user knows HOW to prompt this mode (danbooru tags vs prose). `null` when the role's family has no
   *  ported guide entry (never a fabricated one). */
  guide: comfyuiRoleGuideSchema.nullable(),
  /** The STATIC LoRA reference catalog for this role (comfyui-control §C8 / §4.5) — the LoRAs its family base
   *  offers, sorted by downloads (the picker shows the attachable set + trigger words). Empty for a family with
   *  no LoRA base (anima_edit). A browse surface only — no runtime download (owner-ruled, §8 Q7). */
  loras: z.array(comfyuiRoleLoraSchema),
});
export type ComfyuiRoleAvailability = z.infer<typeof comfyuiRoleAvailabilitySchema>;

/** The `probeImageEngine` result — a discriminated tri-state (D83). `ok-with-models`/`ok-but-empty` carry
 *  the live catalog (the built-in sampler/scheduler/vae lists are present even with zero checkpoints) PLUS the
 *  curated-role availability list (C5 — raw checkpoints ride the catalog, curated `orbgen:<role>` modes ride
 *  `roles`, each with its live availability); `engine-off` carries only the state (unreachable or unconfigured). */
export const comfyuiProbeResultSchema = z.discriminatedUnion("state", [
  comfyuiCatalogSchema.extend({ state: z.literal("ok-with-models"), roles: z.array(comfyuiRoleAvailabilitySchema) }),
  comfyuiCatalogSchema.extend({ state: z.literal("ok-but-empty"), roles: z.array(comfyuiRoleAvailabilitySchema) }),
  z.object({ state: z.literal("engine-off") }),
]);
export type ComfyuiProbeResult = z.infer<typeof comfyuiProbeResultSchema>;
