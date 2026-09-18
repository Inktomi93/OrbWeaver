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

// The sources whose MODEL is server-config truth rather than a user selection: the local vLLM engine
// serves exactly the model it was LAUNCHED with (`VLLM_*_MODEL`), and local-light serves its built-in
// trio. Neither offers a choice, so `roleDefaults.<role>.model` for them is `""` — the resolver re-derives
// the configured id live, and a server-config change is never frozen into a user's settings blob (the
// contract `getModelsForSource`'s header states: the client displays `defaultModelId` but persists "").
// A NON-empty model against one of these sources is therefore an incoherent pair by construction — the
// exact `{source:"vllm", model:"anthropic/claude-sonnet-5"}` shape that 404s every local turn.
const CONFIG_DERIVED_MODEL_SOURCES: ReadonlySet<CredentialSource> = new Set<CredentialSource>(["vllm", "local-light"]);

/** `true` when this source's model comes from server config, so a stored per-role model is meaningless
 *  (see {@link CONFIG_DERIVED_MODEL_SOURCES}). Takes a plain string: callers hold unvalidated form/patch
 *  values as often as a parsed {@link CredentialSource}. */
export function isConfigDerivedModelSource(source: string): boolean {
  return CONFIG_DERIVED_MODEL_SOURCES.has(source as CredentialSource);
}

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
   *  `video` = accepts video content-parts — gates the chat video send exactly as `vision` gates images
   *  (#317; the engine drops-with-`video_dropped` when absent). `file`/`audio` = the model accepts that
   *  input modality (OpenRouter advertises them; capability TRUTH — absent ⇒ false, no consumer sends
   *  those parts yet). */
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
   *  Absent ⇒ no tool-calling (tool-call parts drop with a `tools_unsupported` warning).
   *  `silencesProse` = MEASURED truth about this (model × backend): attaching `tools[]` to a CHAT turn
   *  suppresses the assistant's prose — the wire answers with tool calls and `content: null`, so a turn that
   *  wants BOTH cannot have both here. Local vLLM is the known case (`Qwen3-VL-8B`: 0 chars of narrative on
   *  36/36 tool-attached turns, `finish_reason: tool_calls`, while the same model with NO tools attached wrote
   *  1497–2959 chars every turn — `rpg-extraction-one-call-spike.md` §4g). Truth-only: ABSENT ⇒ the wire
   *  CO-EMITS prose alongside tool calls (the hosted measurement: 6/6). Read through
   *  {@link coEmitsProseWithTools} — never re-spelled per consumer. */
  tools: z.object({ parallel: z.boolean(), silencesProse: z.boolean().optional() }).optional(),
  /** `structured` = accepts `response_format`/JSON-schema constrained output — separate from `tools`. */
  output: z.object({ maxTokens: rangeSchema, structured: z.boolean().optional() }),
  /** `window` = the model's usable context, in tokens. `windowEstimated` marks it a FALLBACK GUESS rather
   *  than truth — the catalog entry omitted `contextLength` (or the whole OR catalog snapshot is cold, the
   *  common case on a fresh install/DB), the agent-sdk daemon reported no row, or a custom-BYO endpoint
   *  declared no window. A guess is still the number the history FIT must run against (we never trim blind),
   *  but a surface that shows a "used / window" ratio MUST say it is unknown rather than present the
   *  fallback as a real denominator (D41 no-silent-degrade). Absent ⇒ the window is real (a curated entry,
   *  the OR catalog's advertised `contextLength`, the vLLM engine's own `max_model_len`, or a BYO-declared
   *  window). */
  context: z.object({ window: z.number(), supports1M: z.boolean().optional(), windowEstimated: z.boolean().optional() }),
  /** The model's top provider applies content moderation (OpenRouter `top_provider.is_moderated`) — a
   *  prompt may be blocked (surfaces as the `moderation` provider error). Truth only; absent ⇒ not
   *  moderated / unknown (R2). */
  moderated: z.boolean().optional(),
  /** Turn/message-array capabilities, keyed on (wire-shape × model). Absent ⇒ `TURNS_FLOOR`. */
  turns: z
    .object({
      /** The wire accepts a DELIVERED trailing-assistant message as prefill; false ⇒ SHAPE normalizes at
       *  delivery. Per-model, per-transport. Read through {@link acceptsAssistantPrefill}, never re-spelled.
       *
       *  WHAT `false` COSTS DIFFERS BY WIRE, and both failure modes are why this is a capability rather than a
       *  try-it: Anthropic hard-400s a delivered trailing-assistant row it will not continue, while a
       *  TEMPLATE-driven local engine silently renders it as a COMPLETED prior turn plus a fresh assistant
       *  header — no error, just a prefill that quietly became history.
       *
       *  `true` DOES NOT MEAN "deliver and hope": a wire whose continuation is a REQUEST FIELD rather than an
       *  array shape (vLLM's `continue_final_message`/`add_generation_prompt` pair) needs its surface to send
       *  that field, and this bit is what authorizes it. Measured `true` on the vLLM arm 2026-08-19 (receipts
       *  on `catalog/turns.ts::VLLM_TURNS`) after the vendored template gained the continuation arm. */
      assistantPrefill: z.boolean(),
      /** A mid-conversation system-authority channel exists and this model honors it, placement-correct. */
      midConversationSystem: z.boolean(),
      /** MEASURED truth: does this (model × wire-shape) accept `system` rows INSIDE the delivered history —
       *  i.e. mid-array, not just the tail channel {@link midConversationSystem} covers? Deliberately a
       *  SIBLING fact rather than a second reader of that bit: `midConversationSystem` is wire-tested for the
       *  DEPTH-0 TAIL only (`assembly/injections`: "the only wire-tested channel is tail-positioned, and a real
       *  system row inside the stable prefix would mutate cached bytes"), and a depth-N note is MID-HISTORY —
       *  shipping history rows as system on the strength of a tail-tested bit is the category error the
       *  capability axis exists to prevent (D69).
       *
       *  ONE consumer, asking exactly this question (where may a `system` row sit INSIDE the history?): the
       *  depth \> 0 arm of the injection splice (`assembly/injections`) — an author's note or a depth-N
       *  world-info entry authored `role:'system'` rides at its depth as a real `system` row instead of
       *  demoting to the `[Note from system: …]` user framing. Read through
       *  {@link acceptsHistorySystemRows}, never re-spelled per consumer.
       *
       *  IT HAD A SECOND CONSUMER until 2026-08-18 — the D129(B) narrator mapping, which delivered a
       *  `narrator`-kind canon row as a wire `system` row where this is true. OWNER-RULED OUT that day,
       *  verbatim: "if you mean group chat narration mode then that is the wrong behavior" — group narration
       *  is ONE generation voicing the whole cast, i.e. the assistant's OUTPUT voice, not the operator
       *  channel. The MEASUREMENT stands (it was always about wire PLACEMENT); what it may never decide is a
       *  canon row's PURPOSE.
       *
       *  FAIL-CLOSED: `false` until a live wire probe measures it per (model × wire-shape) —
       *  `pnpm probe:history-system-rows` (`scripts/probes/history-system-rows.ts`), the same
       *  measure-then-declare seam `tools.silencesProse` rides. Never a model-name regex (D69). Measured
       *  `true` on the vLLM arm 2026-08-18 (the receipts live on `catalog/turns.ts::VLLM_TURNS`); every other
       *  arm is still unmeasured and therefore false. */
      historySystemRows: z.boolean(),
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

/** CAN this wire answer with prose AND tool calls in ONE completion? The ONE home of the co-emission read
 *  (`capability.tools.silencesProse`, inverted): a turn that attaches tools purely to harvest their arguments —
 *  rpg's folded state extraction (D112), the terminal-tools chat primitive — is only viable where the narrative
 *  survives the attachment. `false` also when the model carries no `tools` axis at all (nothing to co-emit).
 *  Homed in `contracts` because BOTH the chat engine (the wire eligibility) and `domain/rpg` (the fold-mount
 *  gate) must read the identical fact — a per-domain re-spelling is exactly how the two would drift. */
export function coEmitsProseWithTools(capability: ModelCapability): boolean {
  return capability.tools !== undefined && capability.tools.silencesProse !== true;
}

/** MAY this wire carry `system` rows INSIDE the delivered history (mid-array, not the tail channel)? The ONE
 *  home of the mid-history system read (`capability.turns.historySystemRows`) — the gate for the depth \> 0
 *  system-injection delivery, and for nothing about a canon row's role (the D129(B) narrator mapping that
 *  also read it was owner-ruled out 2026-08-18). Absent `turns` ⇒ `TURNS_FLOOR` ⇒ false: a model whose cell
 *  was never measured demotes a mid-history system note to the `[Note from system: …]` user framing, exactly
 *  as every unmeasured wire does (D68 fail-closed — absence means the behavior does not engage, never a
 *  guessed default).
 *
 *  Homed in `contracts` beside {@link coEmitsProseWithTools} for the same reason: the SHAPE splice reads it
 *  and any future consumer must read the identical fact rather than re-spell `turns?.historySystemRows`. */
export function acceptsHistorySystemRows(capability: ModelCapability): boolean {
  return capability.turns?.historySystemRows === true;
}

/** MAY this wire continue a DELIVERED trailing-assistant row (`capability.turns.assistantPrefill`)? The ONE
 *  home of the prefill read, for the same reason {@link acceptsHistorySystemRows} has one: it now has readers
 *  in TWO packages — the chat assembler (SHAPE keeps an assistant\@depth-0 injection at depth 0 and skips the
 *  continuation nudge) and the vLLM chat surface (which must additionally send the wire's own continuation
 *  flags), and a per-reader re-spelling is how those two drift apart into a prompt that ends on an assistant
 *  row nobody told the engine to continue. Absent `turns` ⇒ `TURNS_FLOOR` ⇒ false.
 *
 *  It is the CAPABILITY half only. The assembler ANDs it with "no tools ride this turn" (a prefill and a tool
 *  call are incompatible instructions about the same turn end — `engine/pipeline`), and the surface ANDs it
 *  with "the delivered array actually ends on an assistant row". Neither of those is a fact about the model. */
export function acceptsAssistantPrefill(capability: ModelCapability): boolean {
  return capability.turns?.assistantPrefill === true;
}

/** The conservative today-behavior `turns` cell every model defaults to when the resolver can't refine
 *  a per-shape cell. */
export const TURNS_FLOOR: NonNullable<ModelCapability["turns"]> = {
  assistantPrefill: false,
  midConversationSystem: false,
  historySystemRows: false,
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

/** What `connection.resolveChatCapability` returns: the caller's OWN chat-role descriptor PLUS the
 *  `(api, source, model)` it was resolved FOR — i.e. exactly what a turn would run as right now.
 *
 *  The identity is carried because `ModelCapability` is keyed by `(model, backend)` but names NEITHER: a
 *  surface that has to say WHICH connection is in play (the Connections pane's never-saved row, which
 *  otherwise says only "Uses the app default" and names nothing) could not derive it from the descriptor.
 *  Member-safe: the resolution is the CALLER'S OWN (the verb takes no user id) and the credential is NOT
 *  carried — this is {@link ResolvedConnection} minus the secret. Not a zod schema for the same reason
 *  `ResolvedConnection` isn't: `model` is the branded {@link ModelId}. */
export interface ResolvedChatCapability {
  /** The protocol axis the turn would be addressed by. */
  readonly api: ChatApi;
  /** The provider-source the turn would run on (the axis `ResolvedConnection` carries via `credential`). */
  readonly source: CredentialSource;
  /** The healed model id the turn would send. */
  readonly model: ModelId;
  /** The descriptor for this `(model, backend)`. */
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
 *  disabled/absent (ENGINES_POSTURE=off / no GPU); `engine-down` is a REGISTERED local engine that is DEAD
 *  and won't come up on its own (down under `adopt-only`, the passive posture that never spawns — start it);
 *  `host-claude` is the max-pro-sub backend being absent on this deployment — either the operator set
 *  `CLAUDE_BACKEND=off` or no subscription credential was detected, so the agent-sdk backend was never
 *  registered (one cause, not two: the composer needs ONE actionable line and the Connections pane is where
 *  the two fixes are actually told apart — `@orb/contracts/providers::HOST_CLAUDE_STATES`);
 *  `no-connection` is an unconfigured/incoherent connection (no credential row, a routing pairing with no
 *  backend); `unavailable` is the generic fallback (the resolved backend isn't wired). Deterministic-only — a
 *  configured hosted connection reads available and is never pre-flighted (a bad key still fails at send with
 *  the existing provider error). A DOWN engine under `adopt-or-start` reads AVAILABLE (the fleet manager wakes
 *  it on the turn). Client single-homes the reason copy per cause. */
export const CHAT_UNAVAILABLE_CAUSES = ["engine-off", "engine-down", "host-claude", "no-connection", "unavailable"] as const;
export type ChatUnavailableCause = (typeof CHAT_UNAVAILABLE_CAUSES)[number];
// (chatUnavailableCauseSchema deleted 08-03 — orphaned by the TYPO class-B demotion; the type derives from the tuple.)

/** The composer's pre-send availability signal for a chat's OWN resolved connection — "would
 *  `resolveChat → deriveRunner → requireBackend` succeed WITHOUT firing a turn or an API call?" `cause` is
 *  present iff `!available`. Not a turn/execution result — purely the deterministic serveability verdict.
 *
 *  TYPO class-B demotion: this was an infer-only `z.union` — a server→client OUTPUT shape nothing ever
 *  `.parse`s. The `cause` arm DERIVES from {@link ChatUnavailableCause}, so the causes still have one home. */
export type ChatSendAvailability = { readonly available: true } | { readonly available: false; readonly cause: ChatUnavailableCause };

// The brand ENDS at the curated shortlist: OpenRouter ids are plain strings; only curated entries
// carry this brand. `isChatModelId` is the runtime discriminator.
declare const chatModelBrand: unique symbol;
export type ChatModelId = ModelId & { readonly [chatModelBrand]: true };

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = castId<ChatModelId>("claude-opus-4-8");

/** The OpenRouter default chat model — OpenRouter's auto-router; `pickOrModel` heals a null/rejected
 *  OR model id to this. */
export const DEFAULT_OR_CHAT_MODEL_ID: ModelId = castId<ModelId>("openrouter/auto");

// ── The `refresh-model-catalog` workload's terminal result (the workloads junk-drawer exit: authored by
//    the OWNING domain). COUNTS ONLY — no provider entry shape crosses into the queue's vocabulary. ──

/** Each lane (OpenRouter models, agent-sdk models) is best-effort and independent; a failed lane reports
 *  `null` (distinct from 0, a real empty catalog). The run only fails when BOTH lanes fail. */
export interface CatalogRefreshResult {
  readonly models: number | null;
  readonly agentSdkModels: number | null;
}
