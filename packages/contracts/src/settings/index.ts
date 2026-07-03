// `@orb/contracts/settings` — the two DB-backed config TIERS (the top of the contracts DAG, L3).
//
// This node owns the cross-boundary SHAPES of the per-user (`UserSettings`) and admin-runtime
// (`AppSettings`) config tiers: their zod schemas + inferred types + lenient parsers, both built on the
// ONE `defineVersionedConfig` primitive (`#versioned-config`). The client's settings forms validate
// against these; the server + other domains import them. The DOMAIN (`domain/settings`) owns the verbs,
// the floor-merge resolver, and the write serializers — NOT this node. The agent-sdk runtime config (nature c, D8) and the misfiled chat blobs
// (room-overrides / group-config / opening-policy → `#chat`) are explicitly NOT here.
//
// Load-bearing invariants preserved here:
//   • `storedVersion` (the DB column) BEATS the in-blob `schemaVersion` probe — threaded through
//     `defineVersionedConfig.parse` (the corruption guard; a non-idempotent lift must not re-run).
//   • Lenient parse: a non-object / corrupt / null blob degrades to the `default`, never throws.
//   • `null` = CLEAR sentinel: every `appSettingsSchema` field is `.nullable()` AS WELL AS
//     `.optional().catch(undefined)`, so an admin PATCH `{ field: null }` can wipe a top-level override
//     and let the env floor show through (without `.nullable()` the per-field `.catch` would swallow it).
//   • Additive UserSettings namespaces are `.prefault({})` — they read their default with NO version bump.

import { z } from "zod";
import { DEFAULT_GROUP_CONFIG, groupConfigSchema } from "#chat";
import { chatApiSchema, openRouterProviderRoutingSchema } from "#connection";
import { credentialSourceSchema } from "#credentials";
import { regexScriptSchema } from "#regex";
// memory retrieval-mode axis is single-homed in #search; settings derives its enum (no inline re-spell).
import { MEMORY_RETRIEVAL_MODES } from "#search";
import { defineVersionedConfig } from "#versioned-config";

// The chat role's `source` is the canonical `ChatSource`/`CredentialSource` axis (D31). Connection
// re-exports the TYPE (`ChatSource`); the SCHEMA value (`credentialSourceSchema`) lives in its canonical
// home `#credentials` — re-spelling the 4-member union inline would violate the one-home rule.

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// LogLevel — the ONE tuple (foundation/env imports it DOWN for its `z.enum`; kills the hand-kept mirror).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export const logLevelSchema = z.enum(LOG_LEVELS);

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// AppSettings — the admin-runtime override tier (nature b). Every field nullable+optional (null=CLEAR).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

export const APP_SETTINGS_SCHEMA_VERSION = 2;

// Memory-defaults numeric bounds (named — `noMagicNumbers`). The DEFAULT values themselves live in the
// describe text / the domain resolver; the schema only bounds the override.
const SCORE_FLOOR = 0;
const SCORE_CEIL = 1;
const RECENCY_BIAS_FLOOR = 0;
const TEMPERATURE_FLOOR = 0;
const TEMPERATURE_CEIL = 2;

/** Within-chat digest memory tuning. Subsystem-level (admin sets once; every chat reads it). WRITE-side
 *  knobs (blockSize/mode/summarizer determine the SHAPE of stored digests) — changing them retroactively
 *  would mismatch `chat_digests`, which is why they are admin/cross-chat, not per-chat. Enable/disable is
 *  GLOBAL via `mode` (`'off'` disables memory entirely — D36); there is NO `chats.memoryEnabled` column.
 *  A per-USER opt-out (`UserSettings.memory.enabled`, a JSON field — not a column) layers under it. */
export const memoryDefaultsSchema = z.object({
  blockSize: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Messages per tier-0 digest block (default 8; ≈3k BGE tok, under the 8192 cap)."),
  verbatimWindow: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Recent messages never digested — the protect zone / seam buffer (default 8)."),
  queryWindow: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Recent messages used as the retrieval query for mixB/mixC (default 2)."),
  mode: z
    .enum(MEMORY_RETRIEVAL_MODES)
    .optional()
    .describe(
      "off | mixA (all tier-0, chronological) | mixB (+vector retrieve) | mixC (+rerank) | tiered (consolidation bridge). Default mixC.",
    ),
  fanOut: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Tier-k digests consolidated into one tier-(k+1) digest (default 4)."),
  maxTier: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Max consolidation depth; 0 = tier-0 only (default 3)."),
  retrieveK: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Vector candidate pool size for mixB/mixC (default 8)."),
  rerankTo: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Digests kept after cross-encoder rerank in mixC (default 3)."),
  minScore: z
    .number()
    .min(SCORE_FLOOR)
    .max(SCORE_CEIL)
    .optional()
    .describe("Minimum cosine similarity for a retrieved digest (default 0.25)."),
  keywordMatch: z
    .boolean()
    .optional()
    .describe("Also match digest keywords whole-word against recent messages (default true)."),
  recencyBias: z
    .number()
    .min(RECENCY_BIAS_FLOOR)
    .optional()
    .describe("Mild score boost toward recent digests in mixB/mixC (default 0 = off)."),
});
export type MemoryDefaults = z.infer<typeof memoryDefaultsSchema>;

/** Summarizer generation knobs. Subsystem-level: changing temperature mid-chat would mismatch digest
 *  text in the same chat. The CREDENTIAL choice (`credential.source`) is per-user, not here (the v1→v2
 *  lift strips the dropped `memorySummarizer.source`). */
export const memorySummarizerSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(TEMPERATURE_FLOOR).max(TEMPERATURE_CEIL).optional(),
});
export type MemorySummarizerConfig = z.infer<typeof memorySummarizerSchema>;

/** Per-window rate-limit budgets (points per 60s) — env-floored (`RATE_LIMIT_*`), admin-tunable. Decoupled axes:
 *  `publicIp` caps ANONYMOUS per-IP traffic; `authed` is the per-user budget; `general` the authed
 *  backstop; `aiTurn` the GPU/$-spending verbs. (Env floor kept — the budgets stay boot-env; the admin
 *  override layers on top in the resolver.) */
export const rateLimitsSchema = z.object({
  general: z.number().int().positive().optional(),
  aiTurn: z.number().int().positive().optional(),
  publicIp: z.number().int().positive().optional(),
  authed: z.number().int().positive().optional(),
});
export type RateLimits = z.infer<typeof rateLimitsSchema>;

/** vLLM client-side batch concurrency (the promoted `VLLM_*_CONCURRENCY` knobs — born-in-DB code floor,
 *  admin override added). `embed` bounds the embed + image-embed runners
 *  (shared engine); `summarize` the gen-engine summarize batch. */
export const vllmConcurrencySchema = z.object({
  embed: z.number().int().positive().optional(),
  summarize: z.number().int().positive().optional(),
});
export type VllmConcurrency = z.infer<typeof vllmConcurrencySchema>;

// ── D17 owner-box governance toggles (the floor defaults — born-in-DB, no env source). ──
// The asymmetry is the point (ledger D17): LOCAL compute is shared-by-design (only finite-hardware
// contention) so its default is ON + count-budgeted; the HOSTED `max-pro-sub` is ban-prone + real money
// so its default is OFF (owner consent required). These constants ARE the legible floor the domain
// resolver layers an admin override over; the schema fields below stay override-shaped (null=CLEAR).
/** Default: non-owner members MAY drive the owner's shared local compute (vLLM + transformers.js/ONNX). */
export const DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE = true;
/** Default: non-owner members may NOT drive the owner's hosted `max-pro-sub` (ban-prone + money). */
export const DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB = false;

// Every field is `.nullable()` AS WELL AS `.optional().catch(undefined)`: `null` is the documented CLEAR
// sentinel (an admin PATCH `{ field: null }` wipes the override so the env floor reappears). On READ a
// stored `null` behaves exactly like an absent field (`layer()` resolves both with `??`).
export const appSettingsSchema = z.object({
  /** Background corpus auto-indexing on/off (read per-turn). */
  corpusAutoindex: z.boolean().nullable().optional().catch(undefined),
  /** Character names (case-insensitive) excluded at import time — card + its chats dropped. */
  importSkipCharacters: z.array(z.string()).nullable().optional().catch(undefined),
  /** Log verbosity. Live: the resolver rebinds `logger.level` on every reload (no restart needed). */
  logLevel: logLevelSchema.nullable().optional().catch(undefined),
  /** Block external (http/https) media URLs in rendered chat content — a privacy/SSRF guard. Default
   *  off (born-in-DB floor). */
  forbidExternalMedia: z.boolean().nullable().optional().catch(undefined),
  /** Within-chat memory subsystem tuning (see `memoryDefaultsSchema`). Absent → the baked-in defaults. */
  memoryDefaults: memoryDefaultsSchema.nullable().optional().catch(undefined),
  /** Memory summarizer generation knobs (see `memorySummarizerSchema`). */
  memorySummarizer: memorySummarizerSchema.nullable().optional().catch(undefined),
  /** Per-window rate-limit budgets (see `rateLimitsSchema`). Absent → the code floor in the resolver. */
  rateLimits: rateLimitsSchema.nullable().optional().catch(undefined),
  /** vLLM batch concurrency (see `vllmConcurrencySchema`) — the promoted `VLLM_*_CONCURRENCY` knobs. */
  vllmConcurrency: vllmConcurrencySchema.nullable().optional().catch(undefined),
  /** D17 — may non-owner members (delegated admins / chat members) drive the owner's shared LOCAL
   *  compute? Floor `DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE` (ON — local is shared-by-design, only
   *  contention risk). The toggle widens/narrows the default; enforcement is the credential gate. */
  allowNonOwnerLocalCompute: z.boolean().nullable().optional().catch(undefined),
  /** D17 — the per-member local-compute turn/request COUNT budget (paired with the toggle above).
   *  A positive integer; absent → the domain floor (unbounded / supervisor-limited). */
  nonOwnerLocalComputeBudget: z.number().int().positive().nullable().optional().catch(undefined),
  /** D17 — may non-owner members drive the owner's HOSTED `max-pro-sub`? Floor
   *  `DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB` (OFF — ban-prone + real money). The `max-pro-sub` MINT stays
   *  `requireOwner` regardless; this toggle is box governance, not the mint gate. */
  allowNonOwnerMaxProSub: z.boolean().nullable().optional().catch(undefined),
});

/** The stored OVERRIDE blob — every field optional (missing = use the floor; explicit `null` = cleared,
 *  same read behavior as missing). */
export type AppSettings = z.infer<typeof appSettingsSchema>;

// Lift chain: maps a stored blob at version N → N+1.
const APP_SETTINGS_LIFTS: Record<
  number,
  (config: Record<string, unknown>) => Record<string, unknown>
> = {
  // v1 → v2: dropped `memorySummarizer.source` ("local" | "hosted"). Strip it; existing stored values
  // become a no-op (the dispatcher now reads `credential.source`).
  1: (config) => {
    const summarizer = config["memorySummarizer"] as { source?: unknown } | undefined;
    if (summarizer && "source" in summarizer) {
      const { source: _drop, ...rest } = summarizer;
      return { ...config, memorySummarizer: rest, schemaVersion: APP_SETTINGS_SCHEMA_VERSION };
    }
    return { ...config, schemaVersion: APP_SETTINGS_SCHEMA_VERSION };
  },
};

export const appSettingsConfig = defineVersionedConfig<AppSettings>({
  schema: appSettingsSchema,
  version: APP_SETTINGS_SCHEMA_VERSION,
  lifts: APP_SETTINGS_LIFTS,
  default: {} as AppSettings,
});

/**
 * Parse a stored app-settings override blob. Lenient by construction (per-field `.catch`, non-object →
 * `{}` = no overrides) — never throws, so a legacy/garbage blob degrades to "use all floor defaults".
 *
 * AppSettings stores its `schemaVersion` INSIDE the `"app"` blob (the `settings` table has no version
 * column), so the in-blob probe is authoritative here — no `storedVersion` arg.
 */
export function parseAppSettings(raw: unknown): AppSettings {
  return appSettingsConfig.parse(raw);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// UserSettings — the per-user tier (nature: per-user defaults). Namespaced; each section `.prefault({})`.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Per-role provider assignment shapes ──
// One shape (`{ source, model }`) for ALL roles; the chat role additionally carries `api` (its three
// wire protocols) + `providerRouting`. Restricted source arms are genuine per-role subsets of the source
// axis, not a redeclaration of the canonical `CredentialSource` union, and they MIRROR the runtime
// firewall (`infra/providers/roles/firewall.ts` ROLE_SOURCE_POLICY) — input-validation here, the
// fail-closed belt there (the cake forbids contracts importing the server-side policy, so this is
// deliberate defense-in-depth, not a one-home break). embed/rerank/imageEmbed accept the three
// inference-capable sources {openrouter, vllm, local-light} (D39 — local-light is the in-process tier;
// imageEmbed was wrongly vllm-only before, narrower than its own firewall arm — corrected). summarize is
// a chat-turn shaper so it never runs on the chat-less local-light tier; generateImage is hosted-only.
// Per-field `.catch(undefined)` so a stale/invalid stored source (e.g. a role re-pointed off a tier the
// user dropped, or `local-light` left on `summarize`) heals to "no preference" instead of nuking the
// blob — the same self-healing the chat role config and the rest of the settings tree use.
const inferenceRoleSourceSchema = z.enum(["openrouter", "vllm", "local-light"]);
const inferenceRoleConfigSchema = z.object({
  source: inferenceRoleSourceSchema.optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
});
const summarizeRoleConfigSchema = z.object({
  source: z.enum(["openrouter", "vllm"]).optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
});
const openrouterOnlyRoleConfigSchema = z.object({
  source: z.literal("openrouter").optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
});
const chatRoleConfigSchema = z.object({
  // The chat role: api × source × model (+ provider-routing). Per-field `.catch` so a stale/invalid
  // stored value heals to "no preference" instead of nuking the blob. `source` is the canonical
  // `ChatSource`/`CredentialSource` axis (D31 — `credentialSourceSchema` from `#credentials`).
  api: chatApiSchema.optional().catch(undefined),
  source: credentialSourceSchema.optional().catch(undefined),
  model: z.string().nullable().optional().catch(undefined),
  // OpenRouter provider-routing prefs travel with the chat role assignment (routing is global-per-user),
  // NOT on the chat row's metadata. Lenient + self-healing like the rest of the blob.
  providerRouting: openRouterProviderRoutingSchema.optional().catch(undefined),
});

const roleDefaultsSchema = z
  .object({
    chat: chatRoleConfigSchema.optional(),
    embed: inferenceRoleConfigSchema.optional(),
    rerank: inferenceRoleConfigSchema.optional(),
    imageEmbed: inferenceRoleConfigSchema.optional(),
    summarize: summarizeRoleConfigSchema.optional(),
    generateImage: openrouterOnlyRoleConfigSchema.optional(),
  })
  .prefault({});

export const USER_SETTINGS_SCHEMA_VERSION = 2;

// World-info / chat-behavior numeric bounds + defaults (named — `noMagicNumbers`).
const SCAN_DEPTH_MIN = 1;
const SCAN_DEPTH_MAX = 200;
const SCAN_DEPTH_DEFAULT = 6;
const WI_TOKEN_BUDGET_MIN = 0;
const WI_TOKEN_BUDGET_MAX = 65_536;
const WI_TOKEN_BUDGET_DEFAULT = 1024;
const AUTO_SWIPE_MIN_LENGTH_DEFAULT = 0;
const DUP_THRESHOLD_FLOOR = 0;
const DUP_THRESHOLD_CEIL = 1;
const COMPUTE_THEMES_K_MAX = 100;

/** Routing: the per-role provider assignments the Connections panel owns. */
const routingSchema = z.object({ roleDefaults: roleDefaultsSchema }).prefault({});

/** Seeds: values a NEW chat inherits when the caller doesn't specify. Stale ids degrade at consumption. */
const seedsSchema = z
  .object({
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    defaultPersonaId: z.string().nullable().catch(null).default(null),
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    welcomeAssistantCharacterId: z.string().nullable().catch(null).default(null),
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/unowned id degrades to the system-default preset at consumption, so it stays plain.
    defaultPresetId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});

/** World-info cross-chat levers. Per-chat overrides ride on chats.metadata and beat these. */
const worldInfoSchema = z
  .object({
    scanDepth: z
      .number()
      .int()
      .min(SCAN_DEPTH_MIN)
      .max(SCAN_DEPTH_MAX)
      .catch(SCAN_DEPTH_DEFAULT)
      .default(SCAN_DEPTH_DEFAULT),
    tokenBudget: z
      .number()
      .int()
      .min(WI_TOKEN_BUDGET_MIN)
      .max(WI_TOKEN_BUDGET_MAX)
      .catch(WI_TOKEN_BUDGET_DEFAULT)
      .default(WI_TOKEN_BUDGET_DEFAULT),
  })
  .prefault({});

/** Memory subsystem global on/off. Write-side tuning is AppSettings.memoryDefaults. Default off. */
const memorySchema = z
  .object({
    enabled: z.boolean().catch(false).default(false),
  })
  .prefault({});

/** Chat behavioral defaults (ST `power_user` parity). */
const chatSchema = z
  .object({
    autoContinue: z.boolean().catch(false).default(false),
    continueOnSend: z.boolean().catch(true).default(true),
    autoSwipe: z
      .object({
        enabled: z.boolean().default(false),
        minLength: z.number().int().nonnegative().default(AUTO_SWIPE_MIN_LENGTH_DEFAULT),
        blacklist: z.array(z.string()).default([]),
      })
      .prefault({}),
    customStoppingStrings: z.array(z.string()).catch([]).default([]),
  })
  .prefault({});

/** Workload tunables (the triggering user's preferences). */
const workloadsSchema = z
  .object({
    dupThreshold: z
      .number()
      .min(DUP_THRESHOLD_FLOOR)
      .max(DUP_THRESHOLD_CEIL)
      .optional()
      .catch(undefined),
    computeThemesK: z
      .number()
      .int()
      .positive()
      .max(COMPUTE_THEMES_K_MAX)
      .optional()
      .catch(undefined),
  })
  .prefault({});

/** One-shot onboarding latches (each a "has fired" flag, not a preference). */
const onboardingSchema = z
  .object({
    personaWizardSeen: z.boolean().catch(false).default(false),
    defaultCharactersSeeded: z.boolean().catch(false).default(false),
  })
  .prefault({});

/** Profile bits NOT on the `users` table (displayName stays a users column). */
const profileSchema = z
  .object({
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted asset id degrades at consumption (not a validated entity boundary), so it stays plain.
    avatarAssetId: z.string().nullable().optional(),
  })
  .prefault({});

export const userSettingsSchema = z.object({
  // Carried in the blob (self-describes its version). The DB also pins a `user_settings.schemaVersion`
  // COLUMN, which the service threads as `storedVersion` and which BEATS this in-blob value (so a client
  // can't spoof past a lift; the corruption guard against non-idempotent lifts re-running).
  schemaVersion: z.number().int().positive().default(USER_SETTINGS_SCHEMA_VERSION),
  routing: routingSchema,
  seeds: seedsSchema,
  worldInfo: worldInfoSchema,
  memory: memorySchema,
  chat: chatSchema,
  /** Group-chat room defaults a NEW chat's `metadata.group` is seeded from. Additive namespace, NO
   *  version bump (the lenient parser prefaults it). References `groupConfigSchema` from `#chat` (the
   *  counter-intuitive boot edge — settings depends on chat) — carries `memberCardVisibility` (D22,
   *  default `sheet`). `.catch` heals a corrupt blob. */
  groupDefaults: groupConfigSchema.catch(DEFAULT_GROUP_CONFIG).default(DEFAULT_GROUP_CONFIG),
  onboarding: onboardingSchema,
  /** Per-user regex scripts (find/replace over prompt + display). */
  regexScripts: z.array(regexScriptSchema).catch([]).default([]),
  workloads: workloadsSchema,
  profile: profileSchema,
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

/** The object-valued namespaces a section-patch can target (`updateUserSettingsSection`). Excludes the
 *  array/scalar tiers (`regexScripts`, `schemaVersion`) which are whole-value writes. */
export const USER_SETTINGS_SECTIONS = [
  "routing",
  "seeds",
  "worldInfo",
  "memory",
  "chat",
  "groupDefaults",
  "onboarding",
  "workloads",
  "profile",
] as const;
export type UserSettingsSection = (typeof USER_SETTINGS_SECTIONS)[number];

/** The fully-defaulted settings object (what a brand-new / empty user resolves to). */
export const DEFAULT_USER_SETTINGS: UserSettings = userSettingsSchema.parse({});

// Lift chain: maps a stored blob at version N → N+1.
const USER_SETTINGS_LIFTS: Record<
  number,
  (config: Record<string, unknown>) => Record<string, unknown>
> = {
  // v1 → v2: flat grab-bag → named namespaces (settings revamp). Each flat field moves into its domain
  // home; the chat-role tuple (defaultApi/Source/Model) folds into routing.roleDefaults.chat so chat is
  // just another role. Unset fields are omitted — the v2 per-namespace defaults fill them.
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
};

export const userSettingsConfig = defineVersionedConfig<UserSettings>({
  schema: userSettingsSchema,
  version: USER_SETTINGS_SCHEMA_VERSION,
  lifts: USER_SETTINGS_LIFTS,
  default: DEFAULT_USER_SETTINGS,
});

/**
 * Parse a stored `user_settings.config` blob into the typed contract, lifting older shapes first.
 * Lenient by construction (non-object / legacy `{}` / partially-corrupt → never throws).
 *
 * `storedVersion` — pass `user_settings.schemaVersion` (the COLUMN) whenever you have the row; it BEATS
 * the in-blob probe and prevents lifts from re-running on every read (the corruption guard, review
 * V10-5). The persisted blob does NOT carry `schemaVersion` — the column does.
 */
export function parseUserSettings(raw: unknown, storedVersion?: number): UserSettings {
  return userSettingsConfig.parse(raw, storedVersion);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// EffectiveAppConfig — the RESOLVED runtime config (env floor ⊕ stored override). Cross-boundary: the
// client reads the resolved app settings; the server hot paths (engine/embedder/runners) read it sync.
// ════════════════════════════════════════════════════════════════════════════════════════════════════
//
// The asymmetry with `AppSettings` is deliberate: the admin EDITS the
// override blob (`AppSettings` — every field optional/nullable), but always READS BACK the fully-resolved
// floor⊕override config (this shape — every field present). The resolver (`domain/settings/effective-
// config/layer.ts`) is the ONLY producer; the override-shaped sub-types (`RateLimits`/`VllmConcurrency`)
// resolve into these all-present twins.

/** Resolved per-window rate-limit budgets — every field present (the `RateLimits` override is all-optional). */
export interface ResolvedRateLimits {
  general: number;
  aiTurn: number;
  publicIp: number;
  authed: number;
}

/** Resolved vLLM batch concurrency — every field present (the `VllmConcurrency` override is all-optional). */
export interface ResolvedVllmConcurrency {
  embed: number;
  summarize: number;
}

/**
 * The fully-resolved runtime config (every field present) — what `getEffectiveConfig()` returns and the
 * admin AppSettings verbs read back. Two default ORIGINS, kept legible ("env is
 * the floor" is only half-true): env-mirrored fields (`corpusAutoindex`/`importSkipCharacters`/`logLevel`,
 * + the kept `rateLimits` env vars) read the env floor; born-in-DB fields (`forbidExternalMedia`,
 * `memoryDefaults`, `memorySummarizer`, `vllmConcurrency`, the D17 governance toggles) read a code floor
 * (the `DEFAULT_ALLOW_NON_OWNER_*` constants above) only an admin override moves.
 */
export interface EffectiveAppConfig {
  corpusAutoindex: boolean;
  importSkipCharacters: string[];
  logLevel: LogLevel;
  /** Block external (http/https) media URLs in rendered chat content — a privacy/SSRF guard. */
  forbidExternalMedia: boolean;
  /** Within-chat memory subsystem tuning. Empty = the baked-in resolver defaults at the consumer. */
  memoryDefaults: MemoryDefaults;
  memorySummarizer: MemorySummarizerConfig;
  /** Per-window rate-limit budgets (env floor kept; the limiter reads these). */
  rateLimits: ResolvedRateLimits;
  /** vLLM batch concurrency (born-in-DB; the embed/image-embed/summarize runners read it per-batch). */
  vllmConcurrency: ResolvedVllmConcurrency;
  /** D17 — may non-owner members drive the owner's shared LOCAL compute (floor: ON). */
  allowNonOwnerLocalCompute: boolean;
  /** D17 — the per-member local-compute COUNT budget; `null` = the domain floor (unbounded). */
  nonOwnerLocalComputeBudget: number | null;
  /** D17 — may non-owner members drive the owner's HOSTED `max-pro-sub` (floor: OFF). */
  allowNonOwnerMaxProSub: boolean;
}
