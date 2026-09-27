// `@orb/contracts/settings` — the two DB-backed config tiers: per-user `UserSettings` and admin-runtime
// `AppSettings`, both built on `defineVersionedConfig`. The domain owns the verbs/resolver/serializers.

import { isPlainObject } from "@orb/kit/guards";
import { SCROLL_MODES } from "@orb/kit/scroll-mode";
import { z } from "zod";
import { DEFAULT_GROUP_CONFIG, storedGroupConfigSchema } from "#chat";
import { chunkParamsSchema, databankRetrievalSettingsSchema } from "#databank";
import type { IpCertificateSetting } from "#identity";
import { ipCertificateSettingSchema } from "#identity";
import type { ExtractionMode, MultimodalCaptionMode } from "#imagery";
import { IMAGERY_CAPTION_SLOT_IDS, IMAGERY_TEMPLATE_SLOT_IDS } from "#imagery";
import { PROMPT_CACHE_DEPTH_CEIL } from "#inference";
import { legacyProseOverrides, proseOverridesSchema, resolveProseText } from "#prose";
import type { StructuredOutputVehicle } from "#role-clients";
import { structuredOutputVehicleSchema } from "#role-clients";
import { memoryRetrievalModeSchema } from "#search";
import { DATABANK_UPLOAD_MAX_BYTES } from "#uploads";
import { defineVersionedConfig, tolerantArray } from "#versioned-config";
import type { AppearanceSettings } from "./appearance.ts";
import { appearanceSettingsSchema } from "./appearance.ts";

// The `appearance` section lives in its own module so the client's pre-paint boot hint can reach the
// CONTRACT's own schema object (ab192aedf: one set of bounds, never a client copy) without composing this
// whole `UserSettings` tree and its prose tables (#448). Ownership is unchanged — the section is settings',
// and every name it publishes is re-exported here verbatim, so `@orb/contracts/settings` importers see no
// difference. The deep door is the exact `@orb/contracts/settings/appearance` exports entry.
export type { AppearanceBackgroundFit, AppearanceSettings, BackgroundLibraryEntry, BlurSurface, SurfaceTexture } from "./appearance.ts";
export {
  APPEARANCE_BACKGROUND_FITS,
  appearanceSettingsSchema,
  BACKGROUND_DIM_MIN,
  BLUR_SURFACES,
  backgroundLibraryEntrySchema,
  DEFAULT_BLUR_SURFACES,
  SURFACE_TEXTURES,
} from "./appearance.ts";

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// LogLevel — the ONE tuple (foundation/env imports it DOWN for its `z.enum`; kills the hand-kept mirror).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const logLevelSchema = z.enum(LOG_LEVELS) satisfies z.ZodType<LogLevel>;

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// AppSettings — the admin-runtime override tier. Every field nullable+optional (null=CLEAR).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export const APP_SETTINGS_SCHEMA_VERSION = 9;

const SCORE_FLOOR = 0;
const SCORE_CEIL = 1;
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
  mode: memoryRetrievalModeSchema
    .optional()
    .describe("off | mixA (all tier-0, chronological) | mixB (+vector retrieve) | mixC (+rerank) | tiered (consolidation bridge). Default mixC."),
  fanOut: memoryKnob("fanOut", "Tier-k digests consolidated into one tier-(k+1) digest (default 4)."),
  maxTier: memoryKnob("maxTier", "Max consolidation depth; 0 = tier-0 only (default 3)."),
  retrieveK: memoryKnob("retrieveK", "Vector candidate pool size for mixB/mixC (default 8)."),
  rerankTo: memoryKnob("rerankTo", "Digests kept after cross-encoder rerank in mixC (default 3)."),
  minScore: memoryKnob("minScore", "Minimum cosine similarity for a retrieved digest (default 0.25)."),
  keywordMatch: z.boolean().optional().describe("Also match digest keywords whole-word against recent messages (default true)."),
});
export type MemoryDefaults = z.infer<typeof memoryDefaultsSchema>;

// Every knob present + non-nullable — the resolved floor shape (the server `ResolvedMemoryConfig` mirror,
// derived from `MemoryDefaults` so a new knob flows here automatically). `Required<>` alone keeps zod's
// `| undefined`, so strip it with `NonNullable`.
export type ResolvedMemoryDefaults = { [K in keyof MemoryDefaults]-?: NonNullable<MemoryDefaults[K]> };

// The baked-in memoryDefaults FLOOR — the docs/law/Knowledge-Cluster.md §5 grounded numbers (every knob present),
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
};

// The memory summarizer's OWN sampler knobs (owner ruling 2026-08-08 — summarize keeps its own gen params,
// NOT coupled to chat presets). Mirrors the generate path's sampler set so a summarize request carries the
// SAME loop-controls a chat request does. `presencePenalty`/`frequencyPenalty` ride the OpenAI wire range
// (-2..2); `topP`/`minP` are the 0..1 nucleus knobs; `topK` a positive int; `repetitionPenalty` a positive
// multiplier (1 = no penalty). All optional — an absent knob falls to the engine default, EXCEPT the memory
// build defaults `presencePenalty` to a loop-stopping value (see DEFAULT_MEMORY_SUMMARIZER_PRESENCE_PENALTY).
const REPETITION_PENALTY_FLOOR = 0;
const NUCLEUS_FLOOR = 0;
const NUCLEUS_CEIL = 1;
// OpenAI presence_penalty / frequency_penalty wire range — the ONE home shared by the summarizer's own knobs
// AND the vLLM chat surface's per-request gen default (engineLaunch.genPresencePenalty, below).
export const GEN_PRESENCE_PENALTY_MIN = -2;
export const GEN_PRESENCE_PENALTY_MAX = 2;
export const memorySummarizerSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(TEMPERATURE_FLOOR).max(TEMPERATURE_CEIL).optional(),
  topP: z.number().min(NUCLEUS_FLOOR).max(NUCLEUS_CEIL).optional(),
  topK: z.number().int().positive().optional(),
  frequencyPenalty: z.number().min(GEN_PRESENCE_PENALTY_MIN).max(GEN_PRESENCE_PENALTY_MAX).optional(),
  presencePenalty: z.number().min(GEN_PRESENCE_PENALTY_MIN).max(GEN_PRESENCE_PENALTY_MAX).optional(),
  repetitionPenalty: z.number().gt(REPETITION_PENALTY_FLOOR).optional(),
  minP: z.number().min(NUCLEUS_FLOOR).max(NUCLEUS_CEIL).optional(),
});
export type MemorySummarizerConfig = z.infer<typeof memorySummarizerSchema>;

// The memorySummarizer maxTokens FLOOR — the ONE home for the digest-output reserve. The server's
// `DEFAULT_OUTPUT_RESERVE_TOKENS` (domain/chat/memory .../token-guard.ts) DERIVES from this, and the admin
// surface shows it beneath the override, so the displayed floor and the reserve the summarize request uses
// can't diverge. `temperature` has no fixed floor — unset ⇒ the summarizer provider's own default (the
// surface shows "provider default", never a fabricated number), so it is omitted here.
export const DEFAULT_MEMORY_SUMMARIZER_MAX_TOKENS = 1024;

// The memory summarizer's DEFAULT presence penalty — the loop-fix (owner ruling 2026-08-08). The default gen
// model Qwen3-VL ships generation_config.json repetition_penalty=1.0 (no repeat penalty), and the summarize
// wire (engine/chat-completion) does NOT ride the vLLM chat surface's per-request presence default, so a
// summarize turn with no presence penalty degenerates into a loop that runs to maxTokens / the request cut.
// 1.5 is the Qwen3-VL-8B-Instruct model-card value (huggingface.co/Qwen/Qwen3-VL-8B-Instruct). Applied by the
// memory build's summarizerOpts EVEN WHEN memorySummarizer.presencePenalty is unset — presence MUST default to
// a loop-stopping value. An admin override (including a deliberate 0) wins. OpenAI presence range is -2..2.
export const DEFAULT_MEMORY_SUMMARIZER_PRESENCE_PENALTY = 1.5;

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

// The agent-sdk summarize concurrency (Q6): the max in-flight summarize calls the agent-sdk backend runs.
// DISTINCT from vllmConcurrency.summarize (a vLLM engine policy, floor 32) — this caps the Claude-Agent-SDK
// subprocess fan-out (floor 4, byte-identical to the former hardcoded SUMMARIZE_CONCURRENCY). Positive int.
export const AGENT_SDK_CONCURRENCY_MAX = 32;
export const agentSdkConcurrencySchema = z.object({
  summarize: z.number().int().positive().max(AGENT_SDK_CONCURRENCY_MAX).optional(),
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
// (foundation/env) resolved by resolveEngineLaunchConfig. Mostly a LAUNCH tier (applies on engine restart),
// distinct from vllmConcurrency (a HOT policy, applies on next use) — with TWO deliberate hot leaves that ride

// the retired FINAL-Auth-Modes-and-Onboarding design set §9 — runtime-flippable, so AppSettings not ENV.
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

// ── Structured-output WIRE VEHICLE (task #36) ────────────────────────────────────────────────────────────
// The SECOND structured-output axis, and it COMPOSES with the shape above rather than entangling with it:
// the shape decides how we spell an optional field, the vehicle decides which endpoint feature carries the
// schema at all. Only OpenRouter has two; the vocabulary + its per-arm reasoning live beside `ResponseFormat`
// (`#role-clients`), which is where the request shape is minted. Imported DOWN, never re-spelled here.
/** The born-in-DB floor: `auto` — capability-led, with the forced-tool fallback that predates it. */
export const DEFAULT_STRUCTURED_OUTPUT_VEHICLE: StructuredOutputVehicle = "auto";

// ── Prompt-cache depth floor (findings §5) ───────────────────────────────────────────────────────────────
// HOW DEEP into a conversation the Anthropic history `cache_control` breakpoint sits, counted in ROLE
// SWITCHES from the end (`infra/providers/backends/kit/cache-control.ts` owns the axis; within-turn tool
// exchanges are transparent to it). Depth N means the newest N role groups stay OUTSIDE the cached prefix —
// at depth 2, slots 0 and 1 stay volatile.
//
// It is a FLOOR, not an override. Every turn already computes its own MINIMUM safe depth
// (`chat/assembly/shape.ts:computeHistoryBreakpoint`), which aborts outright when something mutates the
// stable prefix; this knob can only push the breakpoint DEEPER than that minimum, never shallower. A
// shallower breakpoint is not a preference, it is a guaranteed wasted cache write — the placer would pin
// bytes that change every turn — so the axis has one honest direction and `Math.max` is the whole rule.
// The floor value 0 is therefore the exact identity: `max(0, safeDepth) === safeDepth`, i.e. an unset knob
// leaves every wire body byte-identical.
//
// Ceiling 20: Anthropic's cache lookback spans ~20 blocks, so a deeper breakpoint has nothing left to find. The
// constant is the inference contract's (`PROMPT_CACHE_DEPTH_CEIL`), which also bounds a connection's own
// `promptCache.historyDepth` — the per-connection minimum this floor bounds from below.
//
// DEEPER THAN THE CONVERSATION MEANS OFF. "Only ever deeper" is not the same as "always safe": a depth a
// room's history cannot reach resolves to no row at all, so NO breakpoint is placed and that turn is not
// cached — an admin who raises this to 8 to "cache harder" turns caching off for every room shorter than
// ~9 role groups. The placer says so out loud (`provider.cache_depth_unreachable`, warn) rather than
// leaving it to be discovered on a bill.
/** The schema bound AND the born-in-DB default, deliberately the same constant: 0 = "use the turn's own
 *  computed minimum" is both the shallowest meaningful value and the shipped behavior, byte-identical. */
export const PROMPT_CACHE_MIN_DEPTH_FLOOR = 0;
export const PROMPT_CACHE_MIN_DEPTH_CEIL = PROMPT_CACHE_DEPTH_CEIL;

// Every field `.nullable()` AS WELL AS `.optional().catch(undefined)`: null is the CLEAR sentinel.
export const appSettingsSchema = z.object({
  corpusAutoindex: z.boolean().nullable().optional().catch(undefined),
  importSkipCharacters: z.array(z.string()).nullable().optional().catch(undefined),
  logLevel: logLevelSchema.nullable().optional().catch(undefined),
  forbidExternalMedia: z.boolean().nullable().optional().catch(undefined),
  trustHtml: z.boolean().nullable().optional().catch(undefined),
  // The deployment CEILING on the html-trust ladder's top rung (#111 leg 3) — "may a card the host opted
  // in run its own scripts in a viewer's browser". Floor FALSE; an AND with the per-character opt-in, never
  // a default it can override. See `@orb/contracts/chat::DeploymentRenderPolicy`.
  allowInteractiveCards: z.boolean().nullable().optional().catch(undefined),
  memoryDefaults: memoryDefaultsSchema.nullable().optional().catch(undefined),
  memorySummarizer: memorySummarizerSchema.nullable().optional().catch(undefined),
  rateLimits: rateLimitsSchema.nullable().optional().catch(undefined),
  agentSdkConcurrency: agentSdkConcurrencySchema.nullable().optional().catch(undefined),
  // The non-owner local-compute budget WINDOW (ms) — the cap's sibling (compose read it hardcoded at 24h).
  maxImageBytes: z.number().int().min(MAX_IMAGE_BYTES_FLOOR).max(MAX_IMAGE_BYTES_CEIL).nullable().optional().catch(undefined),
  // Databank single-document upload cap — TIGHTEN-only (schema max = the route belt).
  maxDatabankBytes: z.number().int().min(MAX_DATABANK_BYTES_FLOOR).max(MAX_DATABANK_BYTES_CEIL).nullable().optional().catch(undefined),
  // The per-transform prompt-transform execution deadline (ms). Born-in-DB floor 250.
  promptTransformDeadlineMs: durationMs().nullable().optional().catch(undefined),
  // The model-catalog success-refresh cadence (ms). Born-in-DB floor 24h.
  catalogRefreshIntervalMs: durationMs().nullable().optional().catch(undefined),
  // The image-variant lossy-encoder quality (folded into the variant cache key — see resolve-variant).
  imageVariantQuality: imageVariantQualitySchema().nullable().optional().catch(undefined),
  /** GOVERNANCE (inference program F12): the PRIVATE-range hosts/CIDRs an `auth: endpoint` connection may dial
   *  (`127.0.0.1`, `::1`, `192.168.1.0/24`…). Per DEPLOYMENT, never per principal — the same SSRF guard with a
   *  data input. Env floor `PRIVATE_ENDPOINT_ALLOWLIST`; DB override wins; born `[127.0.0.1, ::1]` under
   *  `AUTH_MODE=single-user`, empty on a multi-user install (hosted providers only).
   *
   *  An entry MAY carry a PORT (`127.0.0.1:8703`, `[::1]:8703`, `ollama.lan:11434`) and then admits that host
   *  at those ports ONLY — the least-privilege spelling for a shared box, where a bare `127.0.0.1` also hands
   *  out `:22` and `:5432`. A port on a CIDR is refused. The NARROWER spelling wins when both are listed.
   *  ENTRY SYNTAX IS VALIDATED AT THE BELT, NOT HERE, deliberately: this field is `.catch(undefined)`, so a
   *  per-entry refinement would drop the operator's WHOLE list back to the born default over one typo. The
   *  belt (`infra/network/egress.ts::publishPrivateEndpointAllowlist`) refuses the single bad entry, keeps the
   *  rest, and logs the refusal COUNT at warn — an entry list would put the LAN topology in every boot log. */
  privateEndpointAllowlist: z.array(z.string().min(1)).nullable().optional().catch(undefined),
  localMultiUser: z.boolean().nullable().optional().catch(undefined),
  discreetLogin: z.boolean().nullable().optional().catch(undefined),
  // The owner's IP certificate choice (D269). Absent or null is off; only the share domain's verbs write it, after
  // refusing a non-public address, and every start re-checks it, because this generic door can write any shape.
  ipCertificate: ipCertificateSettingSchema.nullable().optional().catch(undefined),
  // The JSON-Schema shape structured-output requests ride (D126) — see STRUCTURED_OUTPUT_SHAPES above.
  structuredOutputShape: structuredOutputShapeSchema.nullable().optional().catch(undefined),
  // WHICH WIRE carries the schema on a backend with two (task #36) — see above. Composes with the shape.
  structuredOutputVehicle: structuredOutputVehicleSchema.nullable().optional().catch(undefined),
  // The Anthropic prompt-cache breakpoint depth FLOOR (role switches from the end) — see above. Bounded at
  // parse: an out-of-range value drops to the floor rather than pushing a breakpoint past the lookback.
  promptCacheMinDepth: z.number().int().min(PROMPT_CACHE_MIN_DEPTH_FLOOR).max(PROMPT_CACHE_MIN_DEPTH_CEIL).nullable().optional().catch(undefined),
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
  // v2→v3: the `engineLaunch` LAUNCH-config section (#14, since RETIRED with the vLLM fleet — inference
  // program F11) was purely additive/optional — no field moved or renamed. Stamp the version so a v2 row
  // stops re-running the lift chain; the absent section reads back as the env floor.
  2: (config) => ({ ...config, schemaVersion: 3 }),
  // v3→v4: the Phase B ⑩ admin-tier fields (agentSdkConcurrency, maxDatabankBytes, promptTransformDeadlineMs,
  // catalogRefreshIntervalMs, imageVariantQuality, and engineLaunch.genPresencePenalty — the last, like
  // nonOwnerLocalComputeBudgetWindowMs beside it, since RETIRED, F11) were purely additive/optional — an
  // absent field reads back as its floor.
  3: (config) => ({ ...config, schemaVersion: 4 }),
  // v4→v5: `structuredOutputShape` (D126) is purely additive/optional — an absent field reads back as its
  // born-in-DB floor (`as-projected`), so no stored blob changes meaning. Same shape as the two lifts above.
  4: (config) => ({ ...config, schemaVersion: 5 }),
  // v5→v6: `promptCacheMinDepth` (findings §5) is purely additive/optional — an absent field reads back as
  // its born-in-DB floor 0, which is the identity of the `Math.max` it feeds, so no stored blob changes
  // meaning and no wire body moves.
  5: (config) => ({ ...config, schemaVersion: 6 }),
  // v6→v7: `structuredOutputVehicle` (task #36) is purely additive/optional — an absent field reads back as
  // its born-in-DB floor (`auto`), which resolves to exactly the vehicle every request used before this
  // knob existed, so no stored blob changes meaning and no wire body moves.
  6: (config) => ({ ...config, schemaVersion: 7 }),
  // v7→v8: `memoryDefaults.recencyBias` is REMOVED (#321, docs/work/0122, owner ruling 2026-08-22). Unlike every lift
  // above this one it DELETES a stored field, so it is the only one that has to be written by hand rather than
  // stamped: the owner's 2026-08-20 probe measured the experimental boost on the real corpus (222-message
  // conversation, biases 0…1) and found the final top-three unchanged in mixC and actively WORSE at a smaller
  // retrieveK, so the knob is retired rather than blessed with a production blend.
  //
  // The deletion is SURGICAL — the section is rebuilt minus one key, never replaced. `memoryDefaults` is an
  // admin's override blob; substituting a default for a section that failed to look right is exactly the #461
  // wipe class, so a non-object / absent section is passed through UNTOUCHED for the schema to judge rather
  // than "repaired" here. (The final schema would strip the unknown key on its own; this lift exists so the
  // stored blob is REWRITTEN clean at the next write and so the removal is legible at the version it happened.)
  7: (config) => {
    const memoryDefaults = config["memoryDefaults"];
    if (isPlainObject(memoryDefaults) && "recencyBias" in memoryDefaults) {
      const { recencyBias: _drop, ...rest } = memoryDefaults;
      return { ...config, memoryDefaults: rest, schemaVersion: 8 };
    }
    return { ...config, schemaVersion: 8 };
  },
  // v8→v9: `ipCertificate` (D269) is purely additive/optional — an absent field reads back as off.
  8: (config) => ({ ...config, schemaVersion: 9 }),
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

// ROUTING LEFT THE SETTINGS BLOB (inference program §5.3, F7/F16): a user's per-task picks are
// `connection_bindings` rows (`actorKind: "user"`), never `roleDefaults.<task>` leaves here; the source lists
// (`INFERENCE_SOURCES` …) that mirrored the firewall are gone with the axis. v8 → v9 DROPS the `routing`
// section outright (no lift, pre-launch posture).
export const USER_SETTINGS_SCHEMA_VERSION = 9;

const SCAN_DEPTH_MIN = 1;
const SCAN_DEPTH_MAX = 200;
const SCAN_DEPTH_DEFAULT = 6;
const WI_TOKEN_BUDGET_MIN = 0;
const WI_TOKEN_BUDGET_MAX = 65_536;
const WI_TOKEN_BUDGET_DEFAULT = 1024;
const AUTO_SWIPE_MIN_LENGTH_DEFAULT = 0;
// Post-round auto-behavior bounds — the max follow-ups a send auto-issues. Default 1 (the neo-parity
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

const themeSettingsSchema = z
  .object({
    // @orb-waive no-raw-id(selectedThemeId): lenient UserSettings tier — a stale/deleted theme id degrades to the Hearth default at resolution (the profile.avatarAssetId precedent), so it stays plain; null = "the default palette" (no sentinel id leaked into contracts).
    selectedThemeId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});

const seedsSchema = z
  .object({
    // @orb-waive no-raw-id(defaultPersonaId): lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    defaultPersonaId: z.string().nullable().catch(null).default(null),
    // @orb-waive no-raw-id(currentPersonaId): lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    currentPersonaId: z.string().nullable().catch(null).default(null),
    // @orb-waive no-raw-id(welcomeAssistantCharacterId): lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    welcomeAssistantCharacterId: z.string().nullable().catch(null).default(null),
    // @orb-waive no-raw-id(defaultPresetId): lenient UserSettings tier — a stale/unowned id degrades to the system-default preset at consumption, so it stays plain.
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

// The per-user databank tuning — the chunk params ingest uses (chunkText) + the
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

// Stream-display scroll behavior (client-honored — the `@orb/ui/message-list` `scrollMode` prop).
// The axis is homed in `@orb/kit/scroll-mode` (reachable by both `contracts` and the `ui` prop, which may
// import kit ONLY); re-exported here under the settings-facing name so existing consumers keep their
// `@orb/contracts/settings` import path (D15 front-door). The wire schema below imports the tuple DOWN.
export const STREAM_SCROLL_MODES = SCROLL_MODES;

const chatSchema = z
  .object({
    // Client-honored (composer keydown): Enter sends by default; off → Enter is a newline and ⌘/Ctrl+Enter sends.
    enterSends: z.boolean().catch(true).default(true),
    autoContinue: z.boolean().catch(false).default(false),
    // The max auto-continue follow-ups a send issues after a length-capped reply (the bound the turn
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
        // NO `.catch` (#1532's versioned-config class sweep, `#versioned-config`'s header §2): a bad element
        // refuses the WHOLE settings write (loud), deliberately, rather than silently dropping a blacklist
        // entry a swipe-time comparison still needs (lossy with no on-screen signal).
        blacklist: z.array(z.string()).default([]),
        // The max auto-swipe regenerations for a rejected reply (the bound the turn engine's
        // AUTO_SWIPE loop reads). Default 1 = the neo-parity ONE-follow-up floor (byte-identical).
        maxRetries: z.number().int().min(AUTO_SWIPE_MAX_RETRIES_MIN).max(AUTO_SWIPE_MAX_RETRIES_MAX).default(AUTO_SWIPE_MAX_RETRIES_DEFAULT),
      })
      .prefault({}),
    // Element-wise (#1365): a non-string element costs THAT entry, not every stop string the user wrote.
    customStoppingStrings: tolerantArray(z.string(), []).default([]),
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
    // Client-honored (the streaming ghost's `useSmoothText` pacer). Default ON (owner ruling 2026-08-09):
    // the #42 forge moved the per-word fade onto `mode="streaming"` itself, so this knob is now PURELY
    // pacing — and the old "smooth is jankier" objection was measured dead on that build (over-budget
    // commits 205→55, LoAFs 18→11). Off ⇒ raw network-chunk cadence, still faded.
    smoothStream: z.boolean().catch(true).default(true),
    smoothStreamCps: z.number().int().min(SMOOTH_STREAM_CPS_MIN).max(SMOOTH_STREAM_CPS_MAX).catch(SMOOTH_STREAM_CPS_DEFAULT).default(SMOOTH_STREAM_CPS_DEFAULT),
    // Client-honored (the MessageList `scrollMode`). Default `follow`: today's sealed sticky-tail behavior.
    streamScrollMode: z.enum(STREAM_SCROLL_MODES).catch("follow").default("follow"),
    // Client-honored (the streaming ghost's `<ReasoningBlock>`). Default ON = today's behavior: the live
    // reasoning disclosure auto-collapses to the "Thought for Ns" header the instant the first answer token
    // lands. Off ⇒ the trace stays open after the answer (the reader closes it), which the SillyTavern
    // reasoning setting also exposes. When ON, the collapse is SNAP (no fold) so the answer prose paints at
    // its final position in one commit rather than being flung up the trace's height
    // (the measured 350–677px prose fling). Live-ghost only — a committed row already
    // mounts collapsed + host-expandable.
    reasoningAutoCollapse: z.boolean().catch(true).default(true),
    // B1 / RULED F2 — the per-USER default for the room-level "offer choices" posture: a room that carries no
    // explicit `chatMetadata.offerChoices` inherits this, so a NEW room is born playing the way its host
    // plays (the cold-start half of the knob — the room value alone would leave every fresh chat off). The
    // room value always wins; the precedence has ONE home (`resolveOfferChoices`, @orb/contracts/chat).
    // SERVER-honored, on the same `UserSettings.chat` → `ChatBehaviorInputs` FOREIGN seam `autoContinue` and
    // `customStoppingStrings` ride. Default OFF ⇒ byte-identical to a tree that never heard of the knob.
    offerChoices: z.boolean().catch(false).default(false),
    // B7 — the per-USER default for the room-level "characters can react" posture (the `react` tool's
    // attach gate). The offerChoices twin on the same FOREIGN seam. Default OFF at BOTH tiers (owner
    // requirement): an autonomous AI dropping reactions is opt-in — a host enables it per room or flips
    // this default; nothing turns it on by silence. Room value wins; ONE precedence home
    // (`resolveCharactersCanReact`, @orb/contracts/chat).
    charactersCanReact: z.boolean().catch(false).default(false),
    // B7 — the per-USER default for the room-level reaction-plane MASTER switch (pills + picker +
    // toggleReaction + the react tool + the attribution loop). Default ON, deliberately opposite its
    // sibling: B6 reactions are a SHIPPED feature, so this knob exists to make them disableable — a
    // default of off would silently retire a live surface. Room value wins; ONE precedence home
    // (`resolveReactionsEnabled`, @orb/contracts/chat). SERVER-honored (the verb gate + the
    // `listReactions` verdict) and client-read only to seat the host's toggle.
    reactionsEnabled: z.boolean().catch(true).default(true),
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
    captions: z
      .object({
        character_multimodal: imageryTemplateField(),
        face_multimodal: imageryTemplateField(),
      })
      .prefault({}),
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
    // sibling seeded-flags below are consumed.
    // The PRE-LEDGER character latch: the user seed (`entry/boot/seed-user-content.ts`, D263) reads it once,
    // on an account's first ledger pass, to record the shipped characters as already given. Nothing writes it.
    defaultCharactersSeeded: z.boolean().catch(false).default(false),
    defaultPersonaSeeded: z.boolean().catch(false).default(false),
    // The ten bundled SCENE PLATES (`domain/settings/seeder/backgrounds.ts`) — its OWN latch, deliberately
    // not folded into `defaultCharactersSeeded` even though the plates are the default cards' scenes: the
    // library is the user's to curate, so deleting every plate must be respected independently of deleting
    // a card, and clearing this alone re-lays the plates onto a library that already has the pack. There is
    // no pack-version twin: a plate is CONTENT-ADDRESSED, so a re-seed is a hash lookup that appends only
    // what is genuinely missing — the stamp a card pack needs to know what to re-dress has no analogue.
    defaultBackgroundsSeeded: z.boolean().catch(false).default(false),
    // The SHOWCASE PLUGIN examples (`entry/boot/seed-example-plugins.ts`) — its OWN latch: the examples are installed (disabled, ungranted) per user, and this flag is
    // also the DELETION-RESPECT guard. A user who uninstalls an example must not find it back on their next
    // request. It gates the INSTALL half only; the upgrade half below runs on every pass, because a latch
    // that meant "never look at these rows again" is exactly what kept improvements from existing installs.
    examplePluginsSeeded: z.boolean().catch(false).default(false),
    // WHAT WE LAST WROTE, per showcase slug: `{ "card-atlas": "1.1.0", … }`. #803's auto-upgrade oracle
    // (owner-ruled 2026-09-05, arm (a)), and the thing that makes "has the user taken this plugin over?"
    // answerable at all.
    //
    // THE PRIOR RULING ON THIS FIELD'S NEIGHBOUR SURVIVES; ITS INPUT CHANGED. `examplePluginsSeeded`'s
    // comment used to end "No pack-version twin: a plugin's own manifest `version` + the `upgrade` verb are
    // the release channel for bundle content, and re-dressing an INSTALLED plugin behind the user's back is
    // exactly what the consent posture exists to prevent." Both halves still hold and are LOAD-BEARING here:
    // this is NOT a pack-version counter and it is NOT a release channel — the release channel is still the
    // shipped manifest's `version` read straight off the bundle (`@orb/showcase-plugins`'s
    // `readShowcaseManifest`) and still the REAL `upgrade` verb, whose own wall is what keeps the upgrade
    // from happening behind anyone's back (widened reach lands the row DISABLED with a standing re-consent,
    // the grant carried forward is the intersection, and a plugin the user turned off stays off). What this
    // map records is PROVENANCE: the version this system itself last installed, so the seeder can tell an
    // untouched copy of its own gift from one the user has since replaced.
    //
    // DIVERGENCE IS A VERSION MISMATCH, which is the plugin domain's OWN existing oracle rather than a new
    // idea — `domain/plugin/verbs/uninstall-for-all-users.ts` already skips a recipient whose
    // `row.version !== record.version` as `version-diverged`, reasoning that they have taken the plugin over.
    // Same rule here, same word. A slug ABSENT from this map on a row that is nonetheless installed is the
    // pre-#803 backfill arm and is adopted as ours (see the seeder's header for why that is the safe arm
    // pre-launch); the arm self-retires, because the first pass records every held slug.
    //
    // `.catch({})` on purpose, like every latch here: a settings blob that comes back at schema defaults
    // costs at most one redundant upgrade pass that the version compare then finds nothing to do in.
    seededPluginVersions: z.record(z.string(), z.string()).catch({}).default({}),
    // The SERVER-WIDE published plugin set (D147 clause (d)) applied to THIS user — its own latch, distinct
    // from `examplePluginsSeeded` because the two carry different content from different authors: the examples
    // ship with the build, the distributed set is whatever this deployment's admin published. A fan-out reaches
    // every user who existed when it ran, so this latch exists for the users created AFTER one — and, exactly
    // like its siblings, it is the DELETION-RESPECT guard: a user who uninstalls a distributed plugin must not
    // find it back on their next request.
    distributedPluginsApplied: z.boolean().catch(false).default(false),
  })
  .prefault({});

const profileSchema = z
  .object({
    // @orb-waive no-raw-id(avatarAssetId): lenient UserSettings tier — a stale/deleted asset id degrades at consumption (not a validated entity boundary), so it stays plain.
    avatarAssetId: z.string().nullable().optional(),
  })
  .prefault({});

export const userSettingsSchema = z.object({
  // The DB also pins a `user_settings.schemaVersion` COLUMN (`storedVersion`), which BEATS this in-blob
  // value so a client can't spoof past a lift.
  schemaVersion: z.number().int().positive().default(USER_SETTINGS_SCHEMA_VERSION),
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
  // The STORED read shares the chat blob's ONE strip home (`storedGroupConfigSchema`): a retired group key
  // is dropped before the strict arms see it, because this `.catch` would otherwise revert the user's saved
  // room defaults to per-speaker — the chat blob's silent-reversal class, one tier up. The section's write
  // path is deep-merge-and-re-validate through this same lenient parser by design, so no strict door moves.
  groupDefaults: storedGroupConfigSchema.catch(DEFAULT_GROUP_CONFIG).default(DEFAULT_GROUP_CONFIG),
  onboarding: onboardingSchema,
  workloads: workloadsSchema,
  profile: profileSchema,
  appearance: appearanceSettingsSchema,
  theme: themeSettingsSchema,
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

/** The object-valued namespaces a section-patch can target (`updateUserSettingsSection`). */
export const USER_SETTINGS_SECTIONS = [
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
    return {
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
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
  // v8→v9 (inference program §13 step 4): `routing.roleDefaults` LEAVES the blob — per-task picks are
  // `connection_bindings` rows now; the old leaves are dropped, never lifted (pre-launch, F19).
  8: (c) => {
    const { routing: _dropped, ...rest } = c;
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

export interface ResolvedAgentSdkConcurrency {
  summarize: number;
}

/** The RESOLVED vLLM engine launch config (env floor ⊕ admin override), every field present. The server's
 *  engine spawner consumes this to build the serve argv (structurally the infra `EngineLaunchConfig`, minus
 *  the env-only ports the spawner reads directly). Applied on engine RESTART, not next-use. */
export interface EffectiveAppConfig {
  corpusAutoindex: boolean;
  importSkipCharacters: string[];
  logLevel: LogLevel;
  forbidExternalMedia: boolean;
  trustHtml: boolean;
  allowInteractiveCards: boolean;
  memoryDefaults: MemoryDefaults;
  memorySummarizer: MemorySummarizerConfig;
  rateLimits: ResolvedRateLimits;
  agentSdkConcurrency: ResolvedAgentSdkConcurrency;
  privateEndpointAllowlist: string[];
  localMultiUser: boolean;
  discreetLogin: boolean;
  /** Null is off: no certificate is asked for and no https listener opens. */
  ipCertificate: IpCertificateSetting | null;
  maxImageBytes: number;
  maxDatabankBytes: number;
  promptTransformDeadlineMs: number;
  catalogRefreshIntervalMs: number;
  imageVariantQuality: number;
  structuredOutputShape: StructuredOutputShape;
  structuredOutputVehicle: StructuredOutputVehicle;
  promptCacheMinDepth: number;
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
