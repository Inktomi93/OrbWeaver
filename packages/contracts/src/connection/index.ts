// The connection cross-boundary wire surface — the SELECTION axes (which api/source/model a turn or
// role runs as) plus the capability DESCRIPTOR that drives both the per-runner translator and the
// client params panel. `connection` is selection, not execution: nothing here carries the sealed
// `runner`/`family` vocab (it stays inside `infra/providers`); the contract speaks only the user
// vocab `{api, source, model}` + the `ModelCapability` descriptor (connection.md invariants 1 & 6).
//
// TWO axes live at the top of this node — keep them distinct (connection.md §7.5):
//   • ChatApi (CHAT_APIS) — the PROTOCOL axis: `agent-sdk | chat-completions | responses`. CANONICAL
//     HERE — its own tuple + schema, declared once so the 18 inline re-spellings in neo-tavern become
//     RED under `no-inline-union-redecl`.
//   • ChatSource — the provider-SOURCE axis. NOT redeclared (D31): it is byte-identical to
//     `CredentialSource` (`@orb/contracts/credentials`), so this node RE-EXPORTS that one canonical
//     declaration as `ChatSource` (`export type { CredentialSource as ChatSource }`). Routing's
//     `source` in `{api, source, model}` IS the credential source; the neo `CHAT_SOURCES` tuple
//     collapses into `CRED_SOURCES` (no second tuple). This is the `connection → credentials` edge.
//
// v1 deferral (shared-dissolution §1.3 cycle break): the BYO `modelProfile` / `CustomModelProfile`
// shape is DEFERRED — it homes in `@orb/contracts/credentials` (NOT here) when it lands, as an
// independent subset of `ModelCapability` that never imports `ModelCapability` backwards. Defining it
// here, or importing it into credentials, would invert the D31 `connection → credentials` edge into a
// cycle. The `ChatModelId` brand / `DEFAULT_CHAT_MODEL_ID` constant / `RoutableChat` overlay shapes
// (the chat-routing input family) are out of scope for this node — see the connection DAG entry.

import type { ModelId } from "@orb/kit/ids";
import { z } from "zod";
import type { ResolvedCredential } from "#credentials";

// --- The protocol axis (CANONICAL home) --------------------------------------
// The chat-completion machinery a turn is addressed by. A separate axis from `ChatSource`: one source
// (e.g. openrouter) can serve several apis. Every dispatch switch over `api` uses `assertNever` for
// exhaustiveness; a new api is a member here + a runner arm, nowhere else (connection.md §7.5).
export const CHAT_APIS = ["agent-sdk", "chat-completions", "responses"] as const;
export type ChatApi = (typeof CHAT_APIS)[number];
export const chatApiSchema = z.enum(CHAT_APIS);

// --- The provider-source axis (re-export, D31) -------------------------------
/**
 * The provider-source axis routing picks (`source` in `{api, source, model}`). IDENTICAL to
 * {@link CredentialSource} — D31 makes `@orb/contracts/credentials` the ONE canonical home of the
 * 4-member axis (`max-pro-sub | openrouter | vllm | custom_openai`); this is a verbatim re-export, not
 * a second tuple. The domain-readable name (`source`) is preserved at the call site while the single
 * source of truth (and its `credentialSourceSchema`) lives down in `credentials`.
 */
export type { CredentialSource as ChatSource } from "#credentials";

// --- OpenRouter provider-routing prefs (the request `provider` object) --------
/**
 * OpenRouter "provider routing" preferences — the request's `provider` object (order/fallbacks/sort/
 * only/ignore/…). OpenRouter owns and evolves this wire shape, so the model is LENIENT: the known
 * knobs are typed and optional, `.loose()` keeps any not-yet-modelled field rather than dropping it.
 * Replaces the bare `Record<string, unknown>` that flowed `chats.metadata` → routing → the runner.
 * Snake_case fields are OpenRouter's own wire names.
 */
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
  })
  .partial()
  .loose();

export type OpenRouterProviderRouting = z.infer<typeof openRouterProviderRoutingSchema>;

/**
 * Parse an unknown value (e.g. a `chats.metadata` field) into provider-routing prefs, leniently.
 * Returns `undefined` for a non-object or a value that fails the (very permissive) schema, so a
 * corrupt stored blob heals to "default routing" rather than throwing on the hot send path.
 */
export function parseProviderRouting(value: unknown): OpenRouterProviderRouting | undefined {
  if (value === null || typeof value !== "object") {
    return;
  }
  const result = openRouterProviderRoutingSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

// --- The capability descriptor — ONE source, DISTINCT axes -------------------
// Replaces neo-tavern's two cross-merged capability systems (`ChatModel` + `FAMILY_CAPS`). Reasoning,
// sampling, verbosity, output and context are SEPARATE axes; produced once per `(model, backend)` by
// the connection domain's `resolveModelCapability`, consumed by BOTH the infra translator and the
// client panel so they can't drift (connection.md §2-§3).

/** How a model reasons. A distinct axis from on/off (`reasoning.enabled`) — `effort:'none'` is NOT
 *  the off-switch (connection.md invariant 3); `EFFORT_LEVELS` below has no `'none'` member. */
export const REASONING_MODES = ["none", "effort", "budget", "adaptive"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];
export const reasoningModeSchema = z.enum(REASONING_MODES);

/** The model's REAL effort levels. Deliberately EXCLUDES `'none'` (the neo `EFFORT_LEVELS` carried it
 *  as a doubled-up off-switch): the on/off decision is `reasoning.enabled`, so a level is never also a
 *  kill-switch (connection.md invariant 3). */
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

/** An inclusive numeric range. The ONE place a knob's bounds live — the client panel reads these for
 *  slider min/max and never re-hardcodes them (connection.md §5). */
export const rangeSchema = z.object({ min: z.number(), max: z.number() });
export type Range = z.infer<typeof rangeSchema>;

/**
 * The capability descriptor for a resolved `(model, backend)`. The ONE source of truth for "what
 * knobs this model honors": a knob the model doesn't list is simply absent (no silent no-ops), and the
 * panel renders by iterating the descriptor (no static slider stack). Reasoning / sampling / verbosity
 * / output / context are distinct axes — never a merged cascade (connection.md §2, §4).
 */
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
  }),
  sampling: z.object({
    temperature: rangeSchema.optional(),
    topP: rangeSchema.optional(),
    topK: rangeSchema.optional(),
    frequencyPenalty: rangeSchema.optional(),
    presencePenalty: rangeSchema.optional(),
    repetitionPenalty: rangeSchema.optional(),
    minP: rangeSchema.optional(),
    seed: z.boolean().optional(),
    logitBias: z.boolean().optional(),
    stop: z.boolean().optional(),
  }),
  verbosity: z.array(verbositySchema).optional(),
  output: z.object({ maxTokens: rangeSchema }),
  context: z.object({ window: z.number(), supports1M: z.boolean().optional() }),
});
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

// --- The model catalog entry (the explicit shape, ex-ReturnType leak) --------
/**
 * One normalized OpenRouter catalog model — the cross-boundary entry the client model picker reads and
 * the connection domain persists in its catalog snapshot. The EXPLICIT shape that replaces neo-tavern's
 * `CatalogModels = Awaited<ReturnType<typeof catalog.rawModels>>` leak (connection.md §7.4): a new
 * required field here is a compile error at every producer, not a silent drift. `id` is a plain string
 * (OR ids like `anthropic/claude-sonnet-4.6` are free-form; only the curated shortlist carries a brand,
 * which lives on the catalog's curated entries — out of scope for this node).
 */
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
  /** Generation params the model/provider accepts (e.g. "tools", "reasoning", "temperature"). */
  supportedParameters: z.array(z.string()),
});
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;

// --- The resolved connection (the 4-tuple a turn/role runs as) ---------------
/**
 * The resolved `{api, model, credential, capability}` a turn or role runs as — replaces neo-tavern's
 * `TurnRouting` (which was keyed on the infra-internal `runner`). The provider-SOURCE axis is carried
 * by `credential.source` (a `ChatSource`/`CredentialSource`), so it is not duplicated as a separate
 * field; `runner`/`family` never appear (sealed in `infra/providers` — connection.md invariants 1 & 6).
 * NOT a Zod schema: `credential` is the brand-protected {@link ResolvedCredential} (constructed only
 * inside the credentials domain), which cannot be parsed from a wire literal.
 */
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
