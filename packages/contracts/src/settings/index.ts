// `@orb/contracts/settings` — the two DB-backed config tiers: per-user `UserSettings` and admin-runtime
// `AppSettings`, both built on `defineVersionedConfig`. The domain owns the verbs/resolver/serializers.

import { isPlainObject } from "@orb/kit/guards";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { SCROLL_MODES } from "@orb/kit/scroll-mode";
import { z } from "zod";
import { DEFAULT_GROUP_CONFIG, groupConfigSchema } from "#chat";
import { chatApiSchema, openRouterProviderRoutingSchema } from "#connection";
import { credentialSourceSchema } from "#credentials";
import { chunkParamsSchema, databankRetrievalSettingsSchema } from "#databank";
import type { ExtractionMode, MultimodalCaptionMode } from "#imagery";
import { IMAGERY_CAPTION_SLOT_IDS, IMAGERY_TEMPLATE_SLOT_IDS } from "#imagery";
import { legacyProseOverrides, proseOverridesSchema, resolveProseText } from "#prose";
import { MEMORY_RETRIEVAL_MODES } from "#search";
// BG-C: the background source-kind vocabulary (`BACKGROUND_IMAGE_KINDS` / `BackgroundImageKind`) is homed in
// `#theme` (shared with the carried `ThemeBackground` twin); consumers import it from `@orb/contracts/theme`.
import { BACKGROUND_IMAGE_KINDS, THEME_CHAT_STYLES, THEME_DENSITIES } from "#theme";
import { DATABANK_UPLOAD_MAX_BYTES } from "#uploads";
import { defineVersionedConfig } from "#versioned-config";

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// LogLevel — the ONE tuple (foundation/env imports it DOWN for its `z.enum`; kills the hand-kept mirror).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const logLevelSchema = z.enum(LOG_LEVELS);

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// AppSettings — the admin-runtime override tier. Every field nullable+optional (null=CLEAR).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export const APP_SETTINGS_SCHEMA_VERSION = 5;

const SCORE_FLOOR = 0;
const SCORE_CEIL = 1;
const RECENCY_BIAS_FLOOR = 0;
// recencyBias is a boost ADDED to the 0..1 cosine score — capped at 1 so an admin can't type an absurd 5.0
// that would swamp similarity entirely (side-eye P3; the schema derives this cap via memoryKnob).
const RECENCY_BIAS_CEIL = 1;
const TEMPERATURE_FLOOR = 0;
const TEMPERATURE_CEIL = 2;

// The per-knob numeric BOUNDS — the ONE home the schema below AND the admin surface's clamp both read, so a
// clamped client value always passes the schema (no silent-wipe path: an out-of-range send fails the inner
// schema and trips memoryDefaults' `.catch(undefined)`, wiping EVERY override). `int` = integer-only;
// `min`/`max` inclusive; `max: null` = unbounded above (the count knobs — the schema never capped them, so
// clamping preserves the exact accepted set). `mode` (enum) + `keywordMatch` (boolean) are non-numeric.
export const MEMORY_DEFAULTS_BOUNDS = {
  blockSize: { min: 1, max: null, int: true },
  verbatimWindow: { min: 0, max: null, int: true },
  queryWindow: { min: 1, max: null, int: true },
  fanOut: { min: 1, max: null, int: true },
  maxTier: { min: 0, max: null, int: true },
  retrieveK: { min: 1, max: null, int: true },
  rerankTo: { min: 1, max: null, int: true },
  minScore: { min: SCORE_FLOOR, max: SCORE_CEIL, int: false },
  recencyBias: { min: RECENCY_BIAS_FLOOR, max: RECENCY_BIAS_CEIL, int: false },
} as const;
export type MemoryDefaultsBoundKey = keyof typeof MEMORY_DEFAULTS_BOUNDS;

// Build one knob's zod number from its bounds (the schema DERIVES from MEMORY_DEFAULTS_BOUNDS — never a
// re-spelled literal that could drift from the surface's clamp).
function memoryKnob(key: MemoryDefaultsBoundKey, describe: string): z.ZodOptional<z.ZodNumber> {
  const b = MEMORY_DEFAULTS_BOUNDS[key];
  const withInt = b.int ? z.number().int() : z.number();
  const withMin = withInt.min(b.min);
  const bounded = b.max === null ? withMin : withMin.max(b.max);
  return bounded.optional().describe(describe);
}

/** Clamp a raw numeric input for one memoryDefaults knob to its schema bounds (min/max + round-to-int),
 *  returning `null` for a non-finite input (the caller drops it). The admin surface calls this before
 *  writing so a fat-fingered value is CLAMPED to a valid one instead of sent out-of-range — which would fail
 *  the inner schema and trip `memoryDefaults.catch(undefined)`, silently wiping every override. One home for
 *  the bounds ⇒ the clamp and the schema can never disagree. */
export function clampMemoryDefault(key: MemoryDefaultsBoundKey, raw: number): number | null {
  if (!Number.isFinite(raw)) {
    return null;
  }
  const b = MEMORY_DEFAULTS_BOUNDS[key];
  const rounded = b.int ? Math.round(raw) : raw;
  const floored = Math.max(b.min, rounded);
  return b.max === null ? floored : Math.min(b.max, floored);
}

export const memoryDefaultsSchema = z.object({
  blockSize: memoryKnob("blockSize", "Messages per tier-0 digest block (default 8; ≈3k BGE tok, under the 8192 cap)."),
  verbatimWindow: memoryKnob("verbatimWindow", "Recent messages never digested — the protect zone / seam buffer (default 8)."),
  queryWindow: memoryKnob("queryWindow", "Recent messages used as the retrieval query for mixB/mixC (default 2)."),
  mode: z
    .enum(MEMORY_RETRIEVAL_MODES)
    .optional()
    .describe("off | mixA (all tier-0, chronological) | mixB (+vector retrieve) | mixC (+rerank) | tiered (consolidation bridge). Default mixC."),
  fanOut: memoryKnob("fanOut", "Tier-k digests consolidated into one tier-(k+1) digest (default 4)."),
  maxTier: memoryKnob("maxTier", "Max consolidation depth; 0 = tier-0 only (default 3)."),
  retrieveK: memoryKnob("retrieveK", "Vector candidate pool size for mixB/mixC (default 8)."),
  rerankTo: memoryKnob("rerankTo", "Digests kept after cross-encoder rerank in mixC (default 3)."),
  minScore: memoryKnob("minScore", "Minimum cosine similarity for a retrieved digest (default 0.25)."),
  keywordMatch: z.boolean().optional().describe("Also match digest keywords whole-word against recent messages (default true)."),
  recencyBias: memoryKnob("recencyBias", "Mild score boost toward recent digests in mixB/mixC (default 0 = off)."),
});
export type MemoryDefaults = z.infer<typeof memoryDefaultsSchema>;

// Every knob present + non-nullable — the resolved floor shape (the server `ResolvedMemoryConfig` mirror,
// derived from `MemoryDefaults` so a new knob flows here automatically). `Required<>` alone keeps zod's
// `| undefined`, so strip it with `NonNullable`.
export type ResolvedMemoryDefaults = { [K in keyof MemoryDefaults]-?: NonNullable<MemoryDefaults[K]> };

// The baked-in memoryDefaults FLOOR — the core/Knowledge-Cluster.md §5 grounded numbers (every knob present),
// the ONE home for the values the schema `.describe()` strings document. The server resolver
// (domain/chat/memory/constants.ts DEFAULTS) derives from this; the admin surface reads it to show the floor
// beneath an override. Every field non-optional: this IS the floor an absent override falls through to.
export const DEFAULT_MEMORY_DEFAULTS: ResolvedMemoryDefaults = {
  blockSize: 8,
  verbatimWindow: 8,
  queryWindow: 2,
  mode: "mixC",
  fanOut: 4,
  maxTier: 3,
  retrieveK: 8,
  rerankTo: 3,
  minScore: 0.25,
  keywordMatch: true,
  recencyBias: 0,
};

export const memorySummarizerSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(TEMPERATURE_FLOOR).max(TEMPERATURE_CEIL).optional(),
});
export type MemorySummarizerConfig = z.infer<typeof memorySummarizerSchema>;

// The memorySummarizer maxTokens FLOOR — the ONE home for the digest-output reserve. The server's
// `DEFAULT_OUTPUT_RESERVE_TOKENS` (domain/chat/memory .../token-guard.ts) DERIVES from this, and the admin
// surface shows it beneath the override, so the displayed floor and the reserve the summarize request uses
// can't diverge. `temperature` has no fixed floor — unset ⇒ the summarizer provider's own default (the
// surface shows "provider default", never a fabricated number), so it is omitted here.
export const DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS = 1024;

// Per-window request-cap bounds (a security control — see domain/settings/effective-config/layer.ts +
// entry/rate-limit-gate.ts). MIN keeps an admin from setting a self-locking absurd-low cap (a cap of 1/min
// would DoS the deployment); MAX keeps a fat-fingered/hostile value from being an effectively-uncapped hole.
// A value outside these bounds fails parse → the field is dropped → the resolver reads the env floor
// (fail-safe: an absurd override never LOOSENS or breaks the limiter, it falls back to the known-good floor).
export const RATE_LIMIT_CAP_MIN = 5;
export const RATE_LIMIT_CAP_MAX = 100_000;
const rateLimitCap = (): z.ZodOptional<z.ZodNumber> => z.number().int().min(RATE_LIMIT_CAP_MIN).max(RATE_LIMIT_CAP_MAX).optional();
export const rateLimitsSchema = z.object({
  aiTurn: rateLimitCap(),
  publicIp: rateLimitCap(),
  authed: rateLimitCap(),
  // Per-IP login-attempt cap/min (backs the auth-route throttle — brute-force + scrypt-CPU-flood guard).
  login: rateLimitCap(),
});
export type RateLimits = z.infer<typeof rateLimitsSchema>;

/** Clamp a raw rate-limit cap to the schema bounds (integer, MIN..MAX), `null` for non-finite. The admin
 *  surface clamps before writing so a fat-fingered cap is corrected instead of sent out-of-range — which
 *  would fail the schema and trip `rateLimits.catch(undefined)`, silently wiping every cap override. Shares
 *  the ONE bounds home with `rateLimitsSchema`. */
export function clampRateLimit(raw: number): number | null {
  if (!Number.isFinite(raw)) {
    return null;
  }
  return Math.min(RATE_LIMIT_CAP_MAX, Math.max(RATE_LIMIT_CAP_MIN, Math.round(raw)));
}

/** Clamp a raw memorySummarizer maxTokens to its schema bounds (positive integer), `null` for non-finite —
 *  same silent-wipe guard as the others (an invalid value would trip `memorySummarizer.catch(undefined)`). */
export function clampMemorySummarizerMaxTokens(raw: number): number | null {
  if (!Number.isFinite(raw)) {
    return null;
  }
  return Math.max(1, Math.round(raw));
}

export const vllmConcurrencySchema = z.object({
  embed: z.number().int().positive().optional(),
  summarize: z.number().int().positive().optional(),
});
export type VllmConcurrency = z.infer<typeof vllmConcurrencySchema>;

// The agent-sdk summarize concurrency (Q6): the max in-flight summarize calls the agent-sdk backend runs.
// DISTINCT from vllmConcurrency.summarize (a vLLM engine policy, floor 32) — this caps the Claude-Agent-SDK
// subprocess fan-out (floor 4, byte-identical to the former hardcoded SUMMARIZE_CONCURRENCY). Positive int.
export const agentSdkConcurrencySchema = z.object({
  summarize: z.number().int().positive().optional(),
});
export type AgentSdkConcurrency = z.infer<typeof agentSdkConcurrencySchema>;

// Image variant lossy-encoder quality (1–100, webp/jpeg) — the admin-tunable default the asset variant
// pipeline encodes at. CRITICAL: the value is folded into the variant CACHE KEY (resolve-variant), so an
// admin change yields fresh keys → regeneration, never a stale-quality variant served forever.
export const IMAGE_VARIANT_QUALITY_MIN = 1;
export const IMAGE_VARIANT_QUALITY_MAX = 100;
const imageVariantQualitySchema = (): z.ZodOptional<z.ZodNumber> => z.number().int().min(IMAGE_VARIANT_QUALITY_MIN).max(IMAGE_VARIANT_QUALITY_MAX).optional();

// Positive-integer millisecond durations (born-in-DB admin floors, no env): the prompt-transform per-transform
// deadline (floor 250ms), the non-owner local-compute budget WINDOW (floor 24h — the cap's sibling), and the
// model-catalog success-refresh cadence (floor 24h). A value ≤0 / non-finite drops at parse → the floor governs.
const durationMs = (): z.ZodOptional<z.ZodNumber> => z.number().int().positive().optional();

// The vLLM engine LAUNCH-config override tier (#14): the per-engine serve flags an admin can retune on
// another box (models / context windows / gpu-util fractions / vision max_pixels) and apply via the admin
// Engines section's "restart to apply" affordance. Every field optional — unset falls to the env floor
// (foundation/env) resolved by resolveEngineLaunchConfig. This is a LAUNCH tier (applies on engine restart),
// distinct from vllmConcurrency (a HOT policy, applies on next use). GPU-util fractions are 0<u≤1.
const GPU_UTIL_FLOOR = 0;
const GPU_UTIL_CEIL = 1;
const gpuUtil = (): z.ZodOptional<z.ZodNumber> => z.number().gt(GPU_UTIL_FLOOR).max(GPU_UTIL_CEIL).optional();
// OpenAI presence_penalty wire range (the vLLM chat surface's per-request default lives in engineLaunch).
export const GEN_PRESENCE_PENALTY_MIN = -2;
export const GEN_PRESENCE_PENALTY_MAX = 2;
export const engineLaunchSchema = z.object({
  embedModel: z.string().min(1).optional(),
  rerankModel: z.string().min(1).optional(),
  genModel: z.string().min(1).optional(),
  embedMaxModelLen: z.number().int().positive().optional(),
  rerankMaxModelLen: z.number().int().positive().optional(),
  genMaxModelLen: z.number().int().positive().optional(),
  embedGpuUtil: gpuUtil(),
  rerankGpuUtilMulti: gpuUtil(),
  rerankGpuUtilSingle: gpuUtil(),
  genGpuUtilMulti: gpuUtil(),
  genGpuUtilSingle: gpuUtil(),
  poolingMaxPixels: z.number().int().positive().optional(),
  genMaxPixels: z.number().int().positive().optional(),
  // The gen engine's --override-generation-config repetition_penalty (#23). Qwen3-VL ships 1.0 (loops on the
  // sampler-less agent-sdk /v1/messages wire → output-cap api_error); the launch default (env floor 1.05)
  // stops the loop. Admin-retunable; applies on engine restart. 0<p (a positive multiplier; 1 = no penalty).
  genRepetitionPenalty: z.number().gt(GPU_UTIL_FLOOR).optional(),
  // The gen engine's default PRESENCE penalty applied per-REQUEST whenever the vLLM chat surface serves (main
  // chat AND role/side-gen traffic, e.g. when main chat rides agent-sdk and a swapped genModel runs on vLLM).
  // Replaces the surface's silent CARD_DEFAULT_PRESENCE_PENALTY=1.5 that hit ANY model; env floor 1.5,
  // admin-retunable per launched model (genRepetitionPenalty is the exact precedent). OpenAI presence_penalty
  // range is -2..2; a preset that sets its own presencePenalty still wins over this default. `.nullable()`: a
  // LEAF `null` is the merge-clear sentinel (the System-tuning section's Reset sends `{ genPresencePenalty:
  // null }` — a nested `undefined` would be stripped by tRPC's plain-JSON wire and no-op the reset; a null
  // survives, and the resolver's `?? floor` reads null as the floor). Clearing ONLY this leaf, never the
  // whole engineLaunch section (which the restart-gated launch editor owns).
  genPresencePenalty: z.number().min(GEN_PRESENCE_PENALTY_MIN).max(GEN_PRESENCE_PENALTY_MAX).nullable().optional(),
});
export type EngineLaunch = z.infer<typeof engineLaunchSchema>;

// D17 — asymmetric default: shared LOCAL compute is opt-out (ON), hosted `max-pro-sub` is opt-in (OFF,
// ban-prone + real money).
export const DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE = true;
export const DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB = false;

// FINAL-Auth-Modes-and-Onboarding.md §9 — runtime-flippable, so AppSettings not ENV.
export const DEFAULT_LOCAL_MULTI_USER = false;
export const DEFAULT_DISCREET_LOGIN = false;

const MAX_IMAGE_BYTES_FLOOR = 100_000;
const MAX_IMAGE_BYTES_CEIL = 100_000_000;
export const DEFAULT_MAX_IMAGE_BYTES = 5_000_000;

// The databank-upload override CEILING = the route belt (@orb/contracts/uploads DATABANK_UPLOAD_MAX_BYTES,
// 20 MiB). An admin override may only ever TIGHTEN below this — the schema max IS the belt so an over-belt
// value drops at parse (fail-safe: a widen attempt never loosens the route/store cap). Floor 100 KB keeps a
// fat-fingered near-zero cap from bricking every document upload.
const MAX_DATABANK_BYTES_FLOOR = 100_000;
const MAX_DATABANK_BYTES_CEIL = DATABANK_UPLOAD_MAX_BYTES;

// ── Structured-output wire shape (D126) ─────────────────────────────────────────────────────────────────
// WHICH JSON-Schema SHAPE a schema-constrained request puts on the wire. Not a per-vendor fact (the per-WIRE
// keyword subset is already decided at each backend's request-build site — `scrubWireSchema`, D93): this is
// the DEPLOYMENT's answer to "how do we spell an OPTIONAL field", and it is admin-switchable because the two
// walls it clears are discovered at runtime, per provider, by whoever is hosting.
//   • `as-projected` — optionals stay optional (`required` lists only the genuinely-required properties).
//     The default: fewest output tokens, and the shape a small local model reads best.
//   • `strict-compatible` — every property lands in `required` and each optional is emitted as
//     `anyOf:[T,{"type":"null"}]`, with `null ≡ absent` re-imposed at the parse boundary (`dropNullValues`),
//     so NOTHING about the contract changes. This is the documented route past BOTH hosted walls: OpenAI
//     strict's "all fields must be required", and Anthropic's undocumented grammar-compiler ceiling on the
//     NUMBER of optionals. It costs one explicit `null` per unset field.
// A string union, not a boolean: the axis is "which shape", and a third documented shape must be able to
// land here without renaming the knob.
export const STRUCTURED_OUTPUT_SHAPES = ["as-projected", "strict-compatible"] as const;
export type StructuredOutputShape = (typeof STRUCTURED_OUTPUT_SHAPES)[number];
/** The born-in-DB floor (no env var — only an admin override moves it). The default STANDS until the owner's
 *  live A/B says otherwise; this tier exists so switching is a click, not a redeploy. */
export const DEFAULT_STRUCTURED_OUTPUT_SHAPE: StructuredOutputShape = "as-projected";
const structuredOutputShapeSchema = z.enum(STRUCTURED_OUTPUT_SHAPES);

// Every field `.nullable()` AS WELL AS `.optional().catch(undefined)`: null is the CLEAR sentinel.
export const appSettingsSchema = z.object({
  corpusAutoindex: z.boolean().nullable().optional().catch(undefined),
  importSkipCharacters: z.array(z.string()).nullable().optional().catch(undefined),
  logLevel: logLevelSchema.nullable().optional().catch(undefined),
  forbidExternalMedia: z.boolean().nullable().optional().catch(undefined),
  trustHtml: z.boolean().nullable().optional().catch(undefined),
  memoryDefaults: memoryDefaultsSchema.nullable().optional().catch(undefined),
  memorySummarizer: memorySummarizerSchema.nullable().optional().catch(undefined),
  rateLimits: rateLimitsSchema.nullable().optional().catch(undefined),
  vllmConcurrency: vllmConcurrencySchema.nullable().optional().catch(undefined),
  agentSdkConcurrency: agentSdkConcurrencySchema.nullable().optional().catch(undefined),
  engineLaunch: engineLaunchSchema.nullable().optional().catch(undefined),
  allowNonOwnerLocalCompute: z.boolean().nullable().optional().catch(undefined),
  nonOwnerLocalComputeBudget: z.number().int().positive().nullable().optional().catch(undefined),
  // The non-owner local-compute budget WINDOW (ms) — the cap's sibling (compose read it hardcoded at 24h).
  nonOwnerLocalComputeBudgetWindowMs: durationMs().nullable().optional().catch(undefined),
  maxImageBytes: z.number().int().min(MAX_IMAGE_BYTES_FLOOR).max(MAX_IMAGE_BYTES_CEIL).nullable().optional().catch(undefined),
  // Databank single-document upload cap — TIGHTEN-only (schema max = the route belt).
  maxDatabankBytes: z.number().int().min(MAX_DATABANK_BYTES_FLOOR).max(MAX_DATABANK_BYTES_CEIL).nullable().optional().catch(undefined),
  // The per-transform prompt-transform execution deadline (ms). Born-in-DB floor 250.
  promptTransformDeadlineMs: durationMs().nullable().optional().catch(undefined),
  // The model-catalog success-refresh cadence (ms). Born-in-DB floor 24h.
  catalogRefreshIntervalMs: durationMs().nullable().optional().catch(undefined),
  // The image-variant lossy-encoder quality (folded into the variant cache key — see resolve-variant).
  imageVariantQuality: imageVariantQualitySchema().nullable().optional().catch(undefined),
  allowNonOwnerMaxProSub: z.boolean().nullable().optional().catch(undefined),
  localMultiUser: z.boolean().nullable().optional().catch(undefined),
  discreetLogin: z.boolean().nullable().optional().catch(undefined),
  // The JSON-Schema shape structured-output requests ride (D126) — see STRUCTURED_OUTPUT_SHAPES above.
  structuredOutputShape: structuredOutputShapeSchema.nullable().optional().catch(undefined),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

const APP_SETTINGS_LIFTS: Record<number, (config: Record<string, unknown>) => Record<string, unknown>> = {
  1: (config) => {
    const summarizer = config["memorySummarizer"] as { source?: unknown } | undefined;
    if (summarizer && "source" in summarizer) {
      const { source: _drop, ...rest } = summarizer;
      return { ...config, memorySummarizer: rest, schemaVersion: 2 };
    }
    return { ...config, schemaVersion: 2 };
  },
  // v2→v3: the `engineLaunch` LAUNCH-config section (#14) is purely additive/optional — no field moved or
  // renamed. Stamp the version so a v2 row stops re-running the lift chain; the absent section reads back
  // as the env floor.
  2: (config) => ({ ...config, schemaVersion: 3 }),
  // v3→v4: the Phase B ⑩ admin-tier fields (agentSdkConcurrency, nonOwnerLocalComputeBudgetWindowMs,
  // maxDatabankBytes, promptTransformDeadlineMs, catalogRefreshIntervalMs, imageVariantQuality, and
  // engineLaunch.genPresencePenalty) are purely additive/optional — an absent field reads back as its floor.
  3: (config) => ({ ...config, schemaVersion: 4 }),
  // v4→v5: `structuredOutputShape` (D126) is purely additive/optional — an absent field reads back as its
  // born-in-DB floor (`as-projected`), so no stored blob changes meaning. Same shape as the two lifts above.
  4: (config) => ({ ...config, schemaVersion: 5 }),
};

export const appSettingsConfig = defineVersionedConfig<AppSettings>({
  schema: appSettingsSchema,
  version: APP_SETTINGS_SCHEMA_VERSION,
  lifts: APP_SETTINGS_LIFTS,
  default: {} as AppSettings,
});

// AppSettings stores its `schemaVersion` INSIDE the blob (no version column) — no `storedVersion` arg.
export function parseAppSettings(raw: unknown): AppSettings {
  return appSettingsConfig.parse(raw);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// UserSettings — the per-user tier. Namespaced; each section `.prefault({})`.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

// The per-role source subsets mirror the runtime firewall (ROLE_SOURCE_POLICY) as defense-in-depth
// (contracts can't import server-side policy). Per-field `.catch(undefined)` self-heals a stale source.
export const INFERENCE_SOURCES = ["openrouter", "vllm", "local-light"] as const;
export const SUMMARIZE_SOURCES = ["openrouter", "vllm", "max-pro-sub"] as const;
// The generateImage role's permitted sources — mirrors ROLE_SOURCE_POLICY.generateImage
export const GENERATE_IMAGE_SOURCES = ["openrouter"] as const;

const inferenceRoleSourceSchema = z.enum(INFERENCE_SOURCES);
// `model` accepts `null` (the client's explicit deepMergePlain clear on a provider switch), mirroring
// chatRoleConfigSchema.model. `.min(1)` still self-heals a stale empty string to undefined.
const inferenceRoleConfigSchema = z.object({
  source: inferenceRoleSourceSchema.optional().catch(undefined),
  model: z.string().min(1).nullable().optional().catch(undefined),
});
const summarizeRoleConfigSchema = z.object({
  source: z.enum(SUMMARIZE_SOURCES).optional().catch(undefined),
  model: z.string().min(1).nullable().optional().catch(undefined),
});
const generateImageRoleConfigSchema = z.object({
  source: z.enum(GENERATE_IMAGE_SOURCES).optional().catch(undefined),
  model: z.string().min(1).nullable().optional().catch(undefined),
});
const chatRoleConfigSchema = z.object({
  api: chatApiSchema.optional().catch(undefined),
  source: credentialSourceSchema.optional().catch(undefined),
  model: z.string().nullable().optional().catch(undefined),
  providerRouting: openRouterProviderRoutingSchema.optional().catch(undefined),
});

const roleDefaultsSchema = z
  .object({
    chat: chatRoleConfigSchema.optional(),
    // The agent role is a per-user connection choice (api + source + model), same shape as chat (D67
    // api-unpin) — the agent's api is NOT server-pinned. (The `buddy` domain that was to validate the
    // resolved api at its entry was purged 2026-07-25; the connection role itself stays live for the
    // rebuild to graft onto.)
    agent: chatRoleConfigSchema.optional(),
    embed: inferenceRoleConfigSchema.optional(),
    rerank: inferenceRoleConfigSchema.optional(),
    imageEmbed: inferenceRoleConfigSchema.optional(),
    summarize: summarizeRoleConfigSchema.optional(),
    generateImage: generateImageRoleConfigSchema.optional(),
  })
  .prefault({});

export const USER_SETTINGS_SCHEMA_VERSION = 8;

const SCAN_DEPTH_MIN = 1;
const SCAN_DEPTH_MAX = 200;
const SCAN_DEPTH_DEFAULT = 6;
const WI_TOKEN_BUDGET_MIN = 0;
const WI_TOKEN_BUDGET_MAX = 65_536;
const WI_TOKEN_BUDGET_DEFAULT = 1024;
const AUTO_SWIPE_MIN_LENGTH_DEFAULT = 0;
// PD-146 post-round auto-behavior bounds — the max follow-ups a send auto-issues. Default 1 (the neo-parity
// ONE-follow-up floor the turn engine hard-coded as AUTO_SWIPE_MAX / AUTO_CONTINUE_MAX); the ceiling caps a
// pathological spend (each retry is a full generation). A value outside these self-heals to the default.
const AUTO_SWIPE_MAX_RETRIES_MIN = 1;
const AUTO_SWIPE_MAX_RETRIES_MAX = 5;
const AUTO_SWIPE_MAX_RETRIES_DEFAULT = 1;
const AUTO_CONTINUE_ROUNDS_MIN = 1;
const AUTO_CONTINUE_ROUNDS_MAX = 5;
const AUTO_CONTINUE_ROUNDS_DEFAULT = 1;
// ⑧(a) temporary-chat reap TTL in HOURS (the per-user reaper's cutoff). Default 24 = the engine's former
// TEMPORARY_CHAT_REAP_TTL_MS (86_400_000ms); 1h..1yr bounds keep a fat-fingered value from wiping fresh
// temp chats or never reaping.
const TEMP_CHAT_TTL_HOURS_MIN = 1;
const TEMP_CHAT_TTL_HOURS_MAX = 8760;
const TEMP_CHAT_TTL_HOURS_DEFAULT = 24;
// Smooth-stream pacing (client-honored — `@orb/ui/stream` useSmoothText): the trickle floor in chars/sec.
// Range mirrors neo's Streaming pref; default OFF so the reveal tracks raw chunk cadence unless opted in.
const SMOOTH_STREAM_CPS_MIN = 15;
const SMOOTH_STREAM_CPS_MAX = 300;
const SMOOTH_STREAM_CPS_DEFAULT = 80;
const DUP_THRESHOLD_FLOOR = 0;
const DUP_THRESHOLD_CEIL = 1;
const COMPUTE_THEMES_K_MAX = 100;
// Cooccurrence-pass tuning (discovery `computeCooccurrence`): the max keyword pairs retained per owner + the
// hub-token cutoff fraction. Bounds mirror the runner's grounded defaults' scale (DEFAULT_MAX_PAIRS=10k,
// DEFAULT_HUB_FRACTION=0.5); a value outside these drops at parse → the runner floor governs (fail-safe).
const COOCCURRENCE_MAX_PAIRS_MIN = 100;
const COOCCURRENCE_MAX_PAIRS_MAX = 1_000_000;
const HUB_FRACTION_FLOOR = 0;
const HUB_FRACTION_CEIL = 1;

const routingSchema = z.object({ roleDefaults: roleDefaultsSchema }).prefault({});

const themeSettingsSchema = z
  .object({
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — a stale/deleted theme id degrades to the Hearth default at resolution (the profile.avatarAssetId precedent), so it stays plain; null = "the default palette" (no sentinel id leaked into contracts).
    selectedThemeId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});

const seedsSchema = z
  .object({
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    defaultPersonaId: z.string().nullable().catch(null).default(null),
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    currentPersonaId: z.string().nullable().catch(null).default(null),
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    welcomeAssistantCharacterId: z.string().nullable().catch(null).default(null),
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — a stale/unowned id degrades to the system-default preset at consumption, so it stays plain.
    defaultPresetId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});

const worldInfoSchema = z
  .object({
    scanDepth: z.number().int().min(SCAN_DEPTH_MIN).max(SCAN_DEPTH_MAX).catch(SCAN_DEPTH_DEFAULT).default(SCAN_DEPTH_DEFAULT),
    tokenBudget: z.number().int().min(WI_TOKEN_BUDGET_MIN).max(WI_TOKEN_BUDGET_MAX).catch(WI_TOKEN_BUDGET_DEFAULT).default(WI_TOKEN_BUDGET_DEFAULT),
  })
  .prefault({});

const memorySchema = z
  .object({
    enabled: z.boolean().catch(false).default(false),
  })
  .prefault({});

// The per-user databank tuning (databank-design/08 §4) — the chunk params ingest uses (chunkText) + the
// retrieval params gather passes to search.documents (k/minScore/rerank) + the `{{databank}}` slot token
// budget. `chunk`/`retrieval` REUSE the `#databank` shapes (derive, never re-spell — a drift fails tsc here);
// `slotTokenBudget` was the chat-side DATABANK_SLOT_TOKEN_BUDGET=4096 constant, absorbed so an admin/user can
// retune the slot's share of the turn. Every nested block `.prefault({})` so an old blob with no databank
// section reads the grounded defaults byte-identically (the memory/appearance additive-section precedent).
const DATABANK_SLOT_TOKEN_BUDGET_MIN = 0;
const DATABANK_SLOT_TOKEN_BUDGET_MAX = 65_536;
const DATABANK_SLOT_TOKEN_BUDGET_DEFAULT = 4096;
const databankSchema = z
  .object({
    chunk: chunkParamsSchema.prefault({}),
    retrieval: databankRetrievalSettingsSchema.prefault({}),
    slotTokenBudget: z
      .number()
      .int()
      .min(DATABANK_SLOT_TOKEN_BUDGET_MIN)
      .max(DATABANK_SLOT_TOKEN_BUDGET_MAX)
      .catch(DATABANK_SLOT_TOKEN_BUDGET_DEFAULT)
      .default(DATABANK_SLOT_TOKEN_BUDGET_DEFAULT),
  })
  .prefault({});

// Stream-display scroll behavior (PD-147, client-honored — the `@orb/ui/message-list` `scrollMode` prop).
// The axis is homed in `@orb/kit/scroll-mode` (reachable by both `contracts` and the `ui` prop, which may
// import kit ONLY); re-exported here under the settings-facing name so existing consumers keep their
// `@orb/contracts/settings` import path (D15 front-door). The wire schema below imports the tuple DOWN.
export const STREAM_SCROLL_MODES = SCROLL_MODES;

const chatSchema = z
  .object({
    // Client-honored (composer keydown): Enter sends by default; off → Enter is a newline and ⌘/Ctrl+Enter sends.
    enterSends: z.boolean().catch(true).default(true),
    autoContinue: z.boolean().catch(false).default(false),
    // PD-146: the max auto-continue follow-ups a send issues after a length-capped reply (the bound the turn
    // engine's AUTO_CONTINUE loop reads). Default 1 = the neo-parity ONE-follow-up floor (byte-identical).
    autoContinueRounds: z
      .number()
      .int()
      .min(AUTO_CONTINUE_ROUNDS_MIN)
      .max(AUTO_CONTINUE_ROUNDS_MAX)
      .catch(AUTO_CONTINUE_ROUNDS_DEFAULT)
      .default(AUTO_CONTINUE_ROUNDS_DEFAULT),
    continueOnSend: z.boolean().catch(true).default(true),
    // W-E: bare Enter on an EMPTY composer with a NON-assistant tail (a draft-forked user tail, an empty
    // committed chat) triggers a generate — the "simple send" keyboard convenience so a reply can be prompted
    // without typing one. The ▷ Response icon is the always-discoverable equivalent; this pref only governs the
    // keyboard shortcut. Default ON (owner-ratified). Off ⇒ empty Enter is a no-op on a non-assistant tail.
    generateOnEmptySend: z.boolean().catch(true).default(true),
    autoSwipe: z
      .object({
        enabled: z.boolean().default(false),
        minLength: z.number().int().nonnegative().default(AUTO_SWIPE_MIN_LENGTH_DEFAULT),
        blacklist: z.array(z.string()).default([]),
        // PD-146: the max auto-swipe regenerations for a rejected reply (the bound the turn engine's
        // AUTO_SWIPE loop reads). Default 1 = the neo-parity ONE-follow-up floor (byte-identical).
        maxRetries: z.number().int().min(AUTO_SWIPE_MAX_RETRIES_MIN).max(AUTO_SWIPE_MAX_RETRIES_MAX).default(AUTO_SWIPE_MAX_RETRIES_DEFAULT),
      })
      .prefault({}),
    customStoppingStrings: z.array(z.string()).catch([]).default([]),
    // ⑧(a) — how long a temporary chat lives before the per-user reaper (`reapTemporaryChats`, scoped to the
    // caller's hosted chats) may delete it. Was the engine's TEMPORARY_CHAT_REAP_TTL_MS=24h const; per-user
    // because the reaper runs under the caller's principal over THEIR chats. A value outside the bounds
    // self-heals to the default.
    tempChatTtlHours: z
      .number()
      .int()
      .min(TEMP_CHAT_TTL_HOURS_MIN)
      .max(TEMP_CHAT_TTL_HOURS_MAX)
      .catch(TEMP_CHAT_TTL_HOURS_DEFAULT)
      .default(TEMP_CHAT_TTL_HOURS_DEFAULT),
    // Client-honored (the streaming ghost's `useSmoothText` pacer). Default OFF: raw chunk cadence.
    smoothStream: z.boolean().catch(false).default(false),
    smoothStreamCps: z.number().int().min(SMOOTH_STREAM_CPS_MIN).max(SMOOTH_STREAM_CPS_MAX).catch(SMOOTH_STREAM_CPS_DEFAULT).default(SMOOTH_STREAM_CPS_DEFAULT),
    // Client-honored (the MessageList `scrollMode`). Default `follow`: today's sealed sticky-tail behavior.
    streamScrollMode: z.enum(STREAM_SCROLL_MODES).catch("follow").default("follow"),
  })
  .prefault({});

export type ChatSettings = z.infer<typeof chatSchema>;

// ⑪ — the library-list page size (rows fetched per page by the paginated library surfaces). Client-honored:
// the collection-surface CONSUMER reads it and passes `limit` into the query (never a factory-internal read,
// tier direction). Default 30 = the former client `PAGE_LIMIT` const (byte-identical); the ceiling mirrors
// the server list verb's MAX_LIMIT=100 (a larger request is server-clamped anyway).
const LIBRARY_PAGE_SIZE_MIN = 10;
const LIBRARY_PAGE_SIZE_MAX = 100;
const LIBRARY_PAGE_SIZE_DEFAULT = 30;
const librarySchema = z
  .object({
    pageSize: z.number().int().min(LIBRARY_PAGE_SIZE_MIN).max(LIBRARY_PAGE_SIZE_MAX).catch(LIBRARY_PAGE_SIZE_DEFAULT).default(LIBRARY_PAGE_SIZE_DEFAULT),
  })
  .prefault({});

// ⑫ per-user image-prompt-building overrides — each mode's extraction/caption instruction, authored by the
// user, composing over the shipped `@orb/contracts/imagery` catalog (unset ⇒ the byte-identical default). Keyed
// by the canonical PROMPT_TEMPLATE_MODES literals (the imagery catalog's shape); every field OPTIONAL with a
// per-field `.catch(undefined)` so a malformed override self-heals to the default (never nukes the section).
// Cap mirrors the request prompt cap scale — an instruction is a paragraph, not an essay.
const IMAGERY_TEMPLATE_MAX_CHARS = 4000;
const imageryTemplateField = (): z.ZodCatch<z.ZodOptional<z.ZodString>> => z.string().max(IMAGERY_TEMPLATE_MAX_CHARS).optional().catch(undefined);
const imagerySchema = z
  .object({
    // The four text-EXTRACTION mode instructions ({{char}}/{{user}} resolve via the ONE macro engine).
    templates: z
      .object({
        character: imageryTemplateField(),
        face: imageryTemplateField(),
        scenario: imageryTemplateField(),
        background: imageryTemplateField(),
      })
      .prefault({}),
    // The two MULTIMODAL vision-caption instructions (no macros — the image is the subject).
    // biome-ignore-start lint/style/useNamingConvention: the keys ARE the snake_case PROMPT_TEMPLATE_MODES literals (the imagery catalog's shape); a rename would fork the wire vocabulary.
    captions: z
      .object({
        character_multimodal: imageryTemplateField(),
        face_multimodal: imageryTemplateField(),
      })
      .prefault({}),
    // biome-ignore-end lint/style/useNamingConvention: see start marker
  })
  .prefault({});

export type ImagerySettings = z.infer<typeof imagerySchema>;

/** Resolve the extraction instruction for a mode: the user's per-mode override ⊕ the shipped
 *  `@orb/contracts/imagery` catalog default. Unset ⇒ byte-identical to the shipped default (the
 *  default-identity discipline). The ONE resolver both the compose op + the tests read (never a re-spelled
 *  fallback that could drift from the catalog).
 *
 *  PROSE-1 §4.6: the STORAGE is unchanged (`imagery.templates.<mode>`, a bare string) — the two rungs are
 *  funnelled through `resolveProse` so precedence and the staleness signal come from ONE place. */
export function resolveImageryTemplate(imagery: ImagerySettings, mode: ExtractionMode): string {
  const id = IMAGERY_TEMPLATE_SLOT_IDS[mode];
  return resolveProseText(id, legacyProseOverrides(id, imagery.templates[mode]));
}

/** Resolve the multimodal caption instruction for a mode: the user's override ⊕ the shipped catalog default. */
export function resolveImageryCaption(imagery: ImagerySettings, mode: MultimodalCaptionMode): string {
  const id = IMAGERY_CAPTION_SLOT_IDS[mode];
  return resolveProseText(id, legacyProseOverrides(id, imagery.captions[mode]));
}

const personaSchema = z
  .object({
    showNotifications: z.boolean().catch(true).default(true),
  })
  .prefault({});

const workloadsSchema = z
  .object({
    dupThreshold: z.number().min(DUP_THRESHOLD_FLOOR).max(DUP_THRESHOLD_CEIL).optional().catch(undefined),
    computeThemesK: z.number().int().positive().max(COMPUTE_THEMES_K_MAX).optional().catch(undefined),
    maxPairs: z.number().int().min(COOCCURRENCE_MAX_PAIRS_MIN).max(COOCCURRENCE_MAX_PAIRS_MAX).optional().catch(undefined),
    hubFraction: z.number().min(HUB_FRACTION_FLOOR).max(HUB_FRACTION_CEIL).optional().catch(undefined),
  })
  .prefault({});

const onboardingSchema = z
  .object({
    // NOTE: `personaWizardSeen` was DELETED (2026-07-26, Phase B ⑥ / D107): it was defined here but READ +
    // WRITTEN by nothing (even in legacy-main). The first-run persona gate triggers on zero owned personas
    // (features/persona/anchors/first-run-persona-dialog.tsx), never on a "seen" flag — the rateLimits.general
    // dead-field precedent. A stored blob's stale `personaWizardSeen` is stripped by zod (unknown key); the
    // sibling seeded-flags below are consumed (character seeder + boot seed-default-persona).
    defaultCharactersSeeded: z.boolean().catch(false).default(false),
    // The default-card PACK VERSION this library was last seeded or migrated to (`CARD_PACK_VERSION` in
    // `domain/character/seeder/cards.ts`). A version stamp rather than a second boolean so every future pack
    // bump reuses ONE door: the seeder re-dresses provably-unedited seeded cards whenever this trails the
    // shipped pack, then re-stamps. `0` is the pre-stamp cohort — either a never-seeded user (the boolean
    // latch above is the authority there) or an install seeded under the v1 pack, which is exactly the
    // cohort the v2 migration exists for. NEVER folded into `defaultCharactersSeeded`: that latch also
    // encodes deletion-respect (a user who deleted the pack must not get it re-created), and the migration
    // only ever touches rows that still exist.
    defaultCharactersPackVersion: z.number().int().min(0).catch(0).default(0),
    defaultPersonaSeeded: z.boolean().catch(false).default(false),
    // The bundled EXAMPLE conversations (`domain/chat/seeder`) — its OWN latch, deliberately not folded into
    // `defaultCharactersSeeded`: the demo chats attach to the seeded cards, so they must be re-runnable
    // independently (clear this alone to re-seed the examples onto a library that already has the pack).
    demoChatsSeeded: z.boolean().catch(false).default(false),
    // The EXAMPLE-pack version those seeded chats were last dressed to (`DEMO_CHAT_PACK_VERSION` in
    // `domain/chat/seeder/demo-chats.ts`) — the `defaultCharactersPackVersion` twin, same reasoning. The
    // examples' DRESSING (the curated room background, the host seat's persona binding, the flagship's
    // authored game state) is pack content that improves between releases, while the transcripts are
    // immutable; a stamp behind the shipped pack runs the seeder's heal, which only ever fills fields still
    // at their seeded default (it never stomps a choice the user made in their copy of an example).
    demoChatsPackVersion: z.number().int().min(0).catch(0).default(0),
  })
  .prefault({});

const profileSchema = z
  .object({
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — a stale/deleted asset id degrades at consumption (not a validated entity boundary), so it stays plain.
    avatarAssetId: z.string().nullable().optional(),
  })
  .prefault({});

// Appearance (D44 §12.1) — DISPLAY-ONLY, never touches stored content (content-processing is preset
// territory, D53). Per-character COLOR theme layers on top; movingUI/waifuMode are OUT of scope here.
const CHAT_WIDTH_PCT_MIN = 30;
const CHAT_WIDTH_PCT_MAX = 100;
const CHAT_WIDTH_PCT_DEFAULT = 60;
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_DEFAULT = 1;
const BACKGROUND_DIM_MIN = 0;
const BACKGROUND_DIM_MAX = 1;
const BACKGROUND_DIM_DEFAULT = 0.45;
const BACKGROUND_BLUR_MIN = 0;
const BACKGROUND_BLUR_MAX = 24;
const BACKGROUND_BLUR_DEFAULT = 0;

export const BLUR_SURFACES = ["panels", "composer", "messages", "modals"] as const;
export type BlurSurface = (typeof BLUR_SURFACES)[number];
// The SHIPPED default of `appearance.blurSurfaces` (owner ruling 2026-08-02 — glass is on by default on
// the three chrome surfaces; it is also the `.catch` self-heal target, matching the sibling knobs).
// `messages` deliberately excluded — the Reading-Surface rule forbids blur behind long reading text by
// default; a user may still opt it in, and an explicitly-stored `[]` is a real opt-out that survives.
export const DEFAULT_BLUR_SURFACES: readonly BlurSurface[] = ["panels", "composer", "modals"];

// `asset` = an own-upload background (PD-131): the picked file is stored as a `background` AssetKind and
// pinned here by `backgroundAssetId` (GC-rooted via the settings live-source scan) + `backgroundAssetHash`
// (the immutable content hash the SYNC `resolveBackgroundUrl` builds `blobUrl(hash)` from — id↔hash is
// fixed for a content-addressed asset, so storing both is denormalized-but-never-stale). The source-kind
// vocabulary (`BACKGROUND_IMAGE_KINDS` / `BackgroundImageKind`) is homed in `#theme` (shared with the
// carried `ThemeBackground` twin — BG-C); consumers import it from `@orb/contracts/theme` directly.

export const SURFACE_TEXTURES = ["none", "grain"] as const;
export type SurfaceTexture = (typeof SURFACE_TEXTURES)[number];
export const APPEARANCE_BACKGROUND_FITS = ["cover", "contain", "stretch", "center"] as const;
export type AppearanceBackgroundFit = (typeof APPEARANCE_BACKGROUND_FITS)[number];

// A saved background-library entry (BG-D) — the per-user list of uploaded backgrounds the picker chooses
// from. Lives in settings (the backgrounds concept's ONE home, D63), NOT a relational table: a flat
// per-user list of dozens with names and zero relational joins. Every entry's `assetId` is GC-rooted by
// the settings live-source scan (`domain/assets/persistence/asset-refs.ts`) so an unpicked upload is never
// reaped. `mime` lets a picked VIDEO entry select the `<video>` background layer (BG-V) over the image one;
// `assetHash` builds `blobUrl(hash)` for the grid thumbnail without an async id→hash round-trip.
export const backgroundLibraryEntrySchema = z.object({
  // @orb-gate-ignore no-raw-id: not an entity FK — a blob-internal per-ROW ui identity, the SAME shape as the sibling client-minted blob-row ids (`regex.scripts[].id`, preset `sections[].id` — plain `crypto.randomUUID()`), and the sibling lenient UserSettings-tier `*Id` exemptions in this file. A branded kit/ids TypeID does NOT fit: the row is minted CLIENT-side (no client TypeID minter) and the v3→v4 backfill is DETERMINISTIC (`${assetId}:${index}`, so it's stable across the reads that re-run the lift before the first v4 write) — neither is a mintable `prefix_…` TypeID.
  // Stable per-ROW id, the key/select/delete/rename target (F-P2): a content-addressed `assetId` is SHARED by
  // byte-identical uploads, so keying rows on it collided (dup React keys + deleting one wiped both). `assetId`
  // stays the content pointer; `entryId` identifies the row.
  entryId: z.string(),
  assetId: typeIdSchema(ID_PREFIX.asset),
  assetHash: z.string(),
  mime: z.string(),
  name: z.string(),
  // Provenance for a materialized external-URL background (BG-C invariant / F-P0-2): the original URL the
  // asset was fetched-and-stored from. Optional (own-uploads have none); metadata only, never re-fetched.
  provenanceUrl: z.string().optional(),
});
export type BackgroundLibraryEntry = z.infer<typeof backgroundLibraryEntrySchema>;

const READING_LINE_HEIGHT_MIN = 1.2;
const READING_LINE_HEIGHT_MAX = 2.2;
const READING_LINE_HEIGHT_DEFAULT = 1.55;
const READING_LETTER_SPACING_MIN = -0.02;
const READING_LETTER_SPACING_MAX = 0.08;
const READING_LETTER_SPACING_DEFAULT = 0;
const READING_PARAGRAPH_SPACING_MIN = 0;
const READING_PARAGRAPH_SPACING_MAX = 3;
const READING_PARAGRAPH_SPACING_DEFAULT = 0.75;
const READING_NAME_SCALE_MIN = 0.8;
const READING_NAME_SCALE_MAX = 1.6;
const READING_BODY_SCALE_MIN = 0.8;
const READING_BODY_SCALE_MAX = 1.6;
const READING_SCALE_DEFAULT = 1;

const BLUR_STRENGTH_MIN = 4;
const BLUR_STRENGTH_MAX = 28;
const BLUR_STRENGTH_DEFAULT = 14;

const appearanceSchema = z
  .object({
    chatWidthPct: z.number().int().min(CHAT_WIDTH_PCT_MIN).max(CHAT_WIDTH_PCT_MAX).catch(CHAT_WIDTH_PCT_DEFAULT).default(CHAT_WIDTH_PCT_DEFAULT),
    fontScale: z.number().min(FONT_SCALE_MIN).max(FONT_SCALE_MAX).catch(FONT_SCALE_DEFAULT).default(FONT_SCALE_DEFAULT),
    avatarSize: z.enum(["sm", "md", "lg"]).catch("md").default("md"),
    avatarShape: z.enum(["round", "square", "rounded"]).catch("round").default("round"),
    avatarAspect: z.enum(["square", "portrait"]).catch("square").default("square"),
    avatarRing: z.enum(["none", "accent"]).catch("none").default("none"),
    density: z.enum(THEME_DENSITIES).catch("comfortable").default("comfortable"),
    elevation: z.enum(["flat", "ramp", "glow"]).catch("flat").default("flat"),
    chatStyle: z.enum(THEME_CHAT_STYLES).catch("bubble").default("bubble"),
    showTimestamps: z.boolean().catch(true).default(true),
    showGenerationTimer: z.boolean().catch(false).default(false),
    // PD-137 — reveal a quiet per-message settled-cost affordance (a paid upstream OpenRouter call, fired
    // on-demand per message, never on load). Default OFF (opt-in, like the other diagnostic chips).
    showGenerationCost: z.boolean().catch(false).default(false),
    showTokenCount: z.boolean().catch(false).default(false),
    showMessageId: z.boolean().catch(false).default(false),
    showModelIcon: z.boolean().catch(false).default(false),
    showInChatAvatars: z.boolean().catch(true).default(true),
    messageActions: z.enum(["expanded", "hover"]).catch("hover").default("hover"),
    autoFixMarkdown: z.boolean().catch(false).default(false),
    // ST parity: imported cards carry their structure in quoted speech, which ST colors — default ON is
    // the ST-expat expectation. Paints the theme's `dialogueColor` (per-character themeOverride wins).
    colorQuotedSpeech: z.boolean().catch(true).default(true),
    blurSurfaces: z
      .array(z.enum(BLUR_SURFACES))
      .catch([...DEFAULT_BLUR_SURFACES])
      .default([...DEFAULT_BLUR_SURFACES]),
    shadowEffects: z.boolean().catch(false).default(false),
    surfaceTexture: z.enum(SURFACE_TEXTURES).catch("none").default("none"),
    reducedMotion: z.boolean().catch(false).default(false),
    backgroundImageKind: z.enum(BACKGROUND_IMAGE_KINDS).catch("none").default("none"),
    // @orb-gate-ignore no-raw-id: not an entity FK — a seeded-background CATALOG slug (matched against the static `listSeededBackgrounds()` set at render), so it stays a plain slug string; an empty/stale value degrades to "no image" at resolution.
    backgroundSeededId: z
      .string()
      .regex(/^[a-z0-9-]*$/u)
      .catch("")
      .default(""),
    // NOTE: there is no flat `backgroundExternalUrl` — an external URL can never paint (CSP `img-src`
    // self/data/blob only, by design), so the global appearance surface materializes a pasted URL server-side
    // (`settings.addExternalBackground`) into a `backgroundLibrary` ASSET entry rather than persisting a
    // paintable external field (the BG-C invariant, side-eye F-P0-2). The kind enum keeps `external` only as a
    // transient INPUT mode (the picker's URL-entry branch), never a persisted paintable state.
    // @orb-gate-ignore no-raw-id: lenient UserSettings tier — the own-upload background asset id (kind `asset`). A stale/deleted value degrades to "no image" at resolution (the `profile.avatarAssetId` precedent); the LIVE value is GC-rooted by the settings live-source scan (`domain/assets/persistence/asset-refs.ts`), not an FK boundary.
    backgroundAssetId: z
      .string()
      .regex(/^(asset_[a-z0-9]+)?$/u)
      .catch("")
      .default(""),
    // The immutable content hash for the `asset` kind — the SYNC `resolveBackgroundUrl` builds
    // `blobUrl(hash)` from it (no async id→hash round-trip). A blank/garbage value degrades to a 404 blob.
    backgroundAssetHash: z.string().catch("").default(""),
    // BG-V: the mime of the picked `asset` background. App-shell branches the `<video>` background layer
    // over the image layer when this is `video/*`; blank (image assets / non-asset kinds) → the image layer.
    backgroundAssetMime: z.string().catch("").default(""),
    // BG-D: the saved background library the picker chooses from. Additive + prefaulted (an old blob reads
    // `[]` with no version bump — the persona/appearance precedent). Every entry's asset is GC-rooted.
    backgroundLibrary: z.array(backgroundLibraryEntrySchema).catch([]).default([]),
    backgroundFit: z.enum(APPEARANCE_BACKGROUND_FITS).catch("cover").default("cover"),
    backgroundDim: z.number().min(BACKGROUND_DIM_MIN).max(BACKGROUND_DIM_MAX).catch(BACKGROUND_DIM_DEFAULT).default(BACKGROUND_DIM_DEFAULT),
    backgroundBlur: z.number().min(BACKGROUND_BLUR_MIN).max(BACKGROUND_BLUR_MAX).catch(BACKGROUND_BLUR_DEFAULT).default(BACKGROUND_BLUR_DEFAULT),
    readingLineHeight: z
      .number()
      .min(READING_LINE_HEIGHT_MIN)
      .max(READING_LINE_HEIGHT_MAX)
      .catch(READING_LINE_HEIGHT_DEFAULT)
      .default(READING_LINE_HEIGHT_DEFAULT),
    readingLetterSpacing: z
      .number()
      .min(READING_LETTER_SPACING_MIN)
      .max(READING_LETTER_SPACING_MAX)
      .catch(READING_LETTER_SPACING_DEFAULT)
      .default(READING_LETTER_SPACING_DEFAULT),
    readingParagraphSpacing: z
      .number()
      .min(READING_PARAGRAPH_SPACING_MIN)
      .max(READING_PARAGRAPH_SPACING_MAX)
      .catch(READING_PARAGRAPH_SPACING_DEFAULT)
      .default(READING_PARAGRAPH_SPACING_DEFAULT),
    readingNameScale: z.number().min(READING_NAME_SCALE_MIN).max(READING_NAME_SCALE_MAX).catch(READING_SCALE_DEFAULT).default(READING_SCALE_DEFAULT),
    readingBodyScale: z.number().min(READING_BODY_SCALE_MIN).max(READING_BODY_SCALE_MAX).catch(READING_SCALE_DEFAULT).default(READING_SCALE_DEFAULT),
    justifyBodyText: z.boolean().catch(false).default(false),
    enableThemeColorization: z.boolean().catch(false).default(false),
    blurStrength: z.number().min(BLUR_STRENGTH_MIN).max(BLUR_STRENGTH_MAX).catch(BLUR_STRENGTH_DEFAULT).default(BLUR_STRENGTH_DEFAULT),
    showLLMReasoningIcon: z.boolean().catch(false).default(false),
  })
  .prefault({});

export type AppearanceSettings = z.infer<typeof appearanceSchema>;

export const userSettingsSchema = z.object({
  // The DB also pins a `user_settings.schemaVersion` COLUMN (`storedVersion`), which BEATS this in-blob
  // value so a client can't spoof past a lift.
  schemaVersion: z.number().int().positive().default(USER_SETTINGS_SCHEMA_VERSION),
  routing: routingSchema,
  seeds: seedsSchema,
  worldInfo: worldInfoSchema,
  memory: memorySchema,
  databank: databankSchema,
  chat: chatSchema,
  library: librarySchema,
  imagery: imagerySchema,
  // PROSE-1 §4.2 — the per-USER prose-slot overrides (`home: "user"` slots only). Keyed by the closed
  // `ProseSlotId` vocabulary, so a RETIRED slot id in a stored blob is stripped at the parse seam rather
  // than failing the whole section. Empty ⇒ every slot resolves to its shipped default, byte-identical.
  // The pre-PROSE-1 `imagery.templates/.captions` fields keep their own storage (§4.6: adapt, never
  // duplicate) and are NOT mirrored here.
  prose: proseOverridesSchema,
  persona: personaSchema,
  groupDefaults: groupConfigSchema.catch(DEFAULT_GROUP_CONFIG).default(DEFAULT_GROUP_CONFIG),
  onboarding: onboardingSchema,
  workloads: workloadsSchema,
  profile: profileSchema,
  appearance: appearanceSchema,
  theme: themeSettingsSchema,
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

/** The object-valued namespaces a section-patch can target (`updateUserSettingsSection`). */
export const USER_SETTINGS_SECTIONS = [
  "routing",
  "seeds",
  "worldInfo",
  "memory",
  "databank",
  "chat",
  "library",
  "imagery",
  // PROSE-1 S2: the section tuple is the EDITOR's door, so it lands in the SAME commit as the Prose settings
  // section that writes it (D107 arm B — a member registered ahead of its writer is a dead switch). The
  // writer is the chat-owned `prose-settings` contribution at the `chat-behavior` anchor; it patches ONE
  // slot-id key at a time (a blank field sends the leaf `null` = back to the shipped default).
  "prose",
  "persona",

  "groupDefaults",
  "onboarding",
  "workloads",
  "profile",
  "appearance",
  "theme",
] as const;
export type UserSettingsSection = (typeof USER_SETTINGS_SECTIONS)[number];

export const DEFAULT_USER_SETTINGS: UserSettings = userSettingsSchema.parse({});

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = DEFAULT_USER_SETTINGS.appearance;

export const DEFAULT_CHAT_SETTINGS: ChatSettings = DEFAULT_USER_SETTINGS.chat;

const USER_SETTINGS_LIFTS: Record<number, (config: Record<string, unknown>) => Record<string, unknown>> = {
  1: (c) => {
    const chat: Record<string, unknown> = {};
    if (c["defaultApi"] !== undefined && c["defaultApi"] !== null) {
      chat["api"] = c["defaultApi"];
    }
    if (c["defaultSource"] !== undefined && c["defaultSource"] !== null) {
      chat["source"] = c["defaultSource"];
    }
    if (c["defaultModel"] !== undefined && c["defaultModel"] !== null) {
      chat["model"] = c["defaultModel"];
    }
    const oldRoleDefaults = (c["roleDefaults"] as Record<string, unknown> | undefined) ?? {};
    return {
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
      routing: {
        roleDefaults: {
          ...oldRoleDefaults,
          ...(Object.keys(chat).length > 0 ? { chat } : {}),
        },
      },
      seeds: { defaultPersonaId: c["defaultPersonaId"] ?? null },
      worldInfo: {
        ...(c["wiScanDepth"] !== undefined ? { scanDepth: c["wiScanDepth"] } : {}),
        ...(c["wiTokenBudget"] !== undefined ? { tokenBudget: c["wiTokenBudget"] } : {}),
      },
      memory: { enabled: c["memoryEnabled"] ?? false },
      regexScripts: c["regexScripts"] ?? [],
      workloads: (c["workloadDefaults"] as Record<string, unknown> | undefined) ?? {},
      profile: (c["profile"] as Record<string, unknown> | undefined) ?? {},
    };
  },
  // v2→v3: the owner-global regex library moved from the top-level `regexScripts` array into its own
  // `regex: { scripts }` object section, so the section-update machinery can address it. Preserve every
  // other namespace untouched; carry any stored scripts across; drop the retired top-level key.
  2: (c) => {
    const { regexScripts, ...rest } = c;
    return { ...rest, regex: { scripts: Array.isArray(regexScripts) ? regexScripts : [] } };
  },
  // v3→v4: mint a stable per-ROW `entryId` on every `appearance.backgroundLibrary` entry (F-P2 — a
  // content-addressed `assetId` is shared by byte-identical uploads, so keying rows on it collided). The
  // backfill is DETERMINISTIC (`${assetId}:${index}`, not a random uuid) so it is stable across the repeated
  // reads that re-run this lift until the first v4 write stamps the storedVersion column — a random mint would
  // hand a different key out on every read. Idempotent: an entry already carrying an `entryId` keeps it.
  3: (c) => {
    const appearance = c["appearance"];
    if (!isPlainObject(appearance)) {
      return c;
    }
    const library = appearance["backgroundLibrary"];
    if (!Array.isArray(library)) {
      return c;
    }
    const backgroundLibrary = library.map((entry: unknown, index: number) => {
      if (!isPlainObject(entry)) {
        return entry;
      }
      const existing = entry["entryId"];
      if (typeof existing === "string" && existing.length > 0) {
        return entry;
      }
      const assetId = typeof entry["assetId"] === "string" ? entry["assetId"] : "bg";
      return { ...entry, entryId: `${assetId}:${index}` };
    });
    return { ...c, appearance: { ...appearance, backgroundLibrary } };
  },
  // v4→v5: the `databank` section (chunk/retrieval/slotTokenBudget) is purely ADDITIVE — an old blob has no
  // databank key, which reads back as the `.prefault({})` grounded defaults (byte-identical to pre-wire).
  // Nothing to move; carry every namespace through untouched (the section's absence IS its default).
  4: (c) => ({ ...c }),
  // v5→v6: the `imagery` section (per-mode prompt-template/caption overrides, Phase B ⑫) is purely ADDITIVE —
  // an old blob has no imagery key, which reads back as `.prefault({})` (every override absent ⇒ the shipped
  // `@orb/contracts/imagery` catalog default, byte-identical). Carry every namespace through untouched.
  5: (c) => ({ ...c }),
  // v6→v7: the `prose` section (PROSE-1 S1 — the app-tier prose-slot overrides) is purely ADDITIVE. An old
  // blob has no prose key, which reads back as `.prefault({})` ⇒ every slot resolves to its shipped default,
  // byte-identical to pre-PROSE-1. Carry every namespace through untouched (the v4→v5/v5→v6 shape).
  6: (c) => ({ ...c }),
  // v7→v8: the `regex` section is DELETED (D121-E). The owner-global script library is no longer an
  // embedded blob — it is `regex_scripts` rows attached through `global_regex_scripts`. A LIFT-TO-DROP and
  // not a silent strip, because the section tuple (`USER_SETTINGS_SECTIONS`) is the section-patch door: a
  // stored `regex` key would otherwise survive as an unaddressable orphan in the blob. NO-LEGACY — the
  // scripts are NOT migrated (BACKREST-MANUAL: the owner re-enters them by hand, the ruled carryover arm).
  7: (c) => {
    const { regex: _retiredLibrary, ...rest } = c;
    return rest;
  },
};

export const userSettingsConfig = defineVersionedConfig<UserSettings>({
  schema: userSettingsSchema,
  version: USER_SETTINGS_SCHEMA_VERSION,
  lifts: USER_SETTINGS_LIFTS,
  default: DEFAULT_USER_SETTINGS,
});

/** `storedVersion` (the column) BEATS the in-blob probe, preventing lifts from re-running on every read. */
export function parseUserSettings(raw: unknown, storedVersion?: number): UserSettings {
  return userSettingsConfig.parse(raw, storedVersion);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// EffectiveAppConfig — the RESOLVED runtime config (env floor ⊕ stored override), every field present.
// Produced only by the domain resolver; the client and server hot paths read it.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export interface ResolvedRateLimits {
  aiTurn: number;
  publicIp: number;
  authed: number;
  login: number;
}

export interface ResolvedVllmConcurrency {
  embed: number;
  summarize: number;
}

export interface ResolvedAgentSdkConcurrency {
  summarize: number;
}

/** The RESOLVED vLLM engine launch config (env floor ⊕ admin override), every field present. The server's
 *  engine spawner consumes this to build the serve argv (structurally the infra `EngineLaunchConfig`, minus
 *  the env-only ports the spawner reads directly). Applied on engine RESTART, not next-use. */
export interface ResolvedEngineLaunch {
  embedModel: string;
  rerankModel: string;
  genModel: string;
  embedMaxModelLen: number;
  rerankMaxModelLen: number;
  genMaxModelLen: number;
  embedGpuUtil: number;
  rerankGpuUtilMulti: number;
  rerankGpuUtilSingle: number;
  genGpuUtilMulti: number;
  genGpuUtilSingle: number;
  poolingMaxPixels: number;
  genMaxPixels: number;
  genRepetitionPenalty: number;
  genPresencePenalty: number;
}

export interface EffectiveAppConfig {
  corpusAutoindex: boolean;
  importSkipCharacters: string[];
  logLevel: LogLevel;
  forbidExternalMedia: boolean;
  trustHtml: boolean;
  memoryDefaults: MemoryDefaults;
  memorySummarizer: MemorySummarizerConfig;
  rateLimits: ResolvedRateLimits;
  vllmConcurrency: ResolvedVllmConcurrency;
  agentSdkConcurrency: ResolvedAgentSdkConcurrency;
  engineLaunch: ResolvedEngineLaunch;
  allowNonOwnerLocalCompute: boolean;
  nonOwnerLocalComputeBudget: number | null;
  nonOwnerLocalComputeBudgetWindowMs: number;
  allowNonOwnerMaxProSub: boolean;
  localMultiUser: boolean;
  discreetLogin: boolean;
  maxImageBytes: number;
  maxDatabankBytes: number;
  promptTransformDeadlineMs: number;
  catalogRefreshIntervalMs: number;
  imageVariantQuality: number;
  structuredOutputShape: StructuredOutputShape;
}

/** The admin-surface read for AppSettings: the RESOLVED config (floor ⊕ override, every field present) PLUS
 *  the raw STORED overrides (every field `null`/absent = the floor governs, a value = an active override).
 *  The pane needs BOTH to render honestly — which fields are actively overridden vs on the floor, and to
 *  offer a real "clear override" (write the `null` sentinel). `getAppSettings` returns only `resolved`; this
 *  richer read (`getAppSettingsWithOverrides`) adds `overrides` without changing that existing surface. */
export interface AppSettingsView {
  readonly resolved: EffectiveAppConfig;
  readonly overrides: AppSettings;
}
