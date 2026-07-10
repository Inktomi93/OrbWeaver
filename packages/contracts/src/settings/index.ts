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
// chatStyle/density are single-homed in #theme (the ThemeOverride wire clamp, paired with @orb/ui's
// ThemeScope render clamp — D44 §12.5). `appearance` DERIVES them here, never re-spells the members
// (the §3.4 themes-design snippet inlined a third `z.enum(["bubble","flat","document"])` copy — a
// one-home violation; this import is the fix the coordinator approved).
import { THEME_CHAT_STYLES, THEME_DENSITIES } from "#theme";
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

// ── Generated-image download cap (born-in-DB; no env source). The imagery domain downloads a
// provider-returned image URL through the SSRF-safe `fetchImageBytes` → `safeFetch` byte cap; high-res
// models can exceed the baked 5 MB, so the cap is a deployment knob (admin AppSettings). Bounds keep it
// sane (`noMagicNumbers`): a floor no legit image undershoots (an absurdly-low cap would drop every
// image) and a ceiling that blocks an unbounded-memory / decompression-bomb footgun.
const MAX_IMAGE_BYTES_FLOOR = 100_000;
const MAX_IMAGE_BYTES_CEIL = 100_000_000;
/** Default generated-image download byte cap (born-in-DB floor; matches `safeFetch`'s own 5 MB default so
 *  behavior is unchanged out of the box). An admin override raises it for high-res models; no env var. */
export const DEFAULT_MAX_IMAGE_BYTES = 5_000_000;

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
   *  ON (D44 §12.3 — forbid by default; the load itself is the tracking-pixel/exfil). Overridable per
   *  deployment (admin) and per character (`override ?? global`). */
  forbidExternalMedia: z.boolean().nullable().optional().catch(undefined),
  /** D44 §12.0 — render rich HTML (Tier-A cards + Mermaid) as TRUSTED by default. Deployment-wide OPT-IN
   *  to the untrusted-by-default render posture (a per-character `trustHtml` override layers on top —
   *  `override ?? global`). Default off (born-in-DB floor): untrusted. */
  trustHtml: z.boolean().nullable().optional().catch(undefined),
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
  /** Max bytes for a generated-image download (the provider-URL fetch through `fetchImageBytes` →
   *  safeFetch's response byte cap). Born-in-DB floor `DEFAULT_MAX_IMAGE_BYTES` (5 MB); an admin override
   *  raises it for high-res models. Bounded `[MAX_IMAGE_BYTES_FLOOR, MAX_IMAGE_BYTES_CEIL]`. */
  maxImageBytes: z
    .number()
    .int()
    .min(MAX_IMAGE_BYTES_FLOOR)
    .max(MAX_IMAGE_BYTES_CEIL)
    .nullable()
    .optional()
    .catch(undefined),
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

/** Which theme is active for this user (themes-design.md §3.3). Additive namespace — `.prefault({})`, NO
 *  version bump (the D44 §12.1 "zero migration" commitment). The user's OVERRIDE VALUES live on the
 *  selected `themes` ROW (the settings-homed entity), never inline here — a copy here would be a second
 *  home that diverges from the row (one-home law); self-authoring = duplicate a seed → edit the owned
 *  copy → select it. */
const themeSettingsSchema = z
  .object({
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted theme id degrades to the Hearth default at resolution (the profile.avatarAssetId precedent), so it stays plain; null = "the default palette" (no sentinel id leaked into contracts).
    selectedThemeId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});

/** Seeds: values a NEW chat inherits when the caller doesn't specify. Stale ids degrade at consumption. */
const seedsSchema = z
  .object({
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    defaultPersonaId: z.string().nullable().catch(null).default(null),
    // Pointer #2 (FINAL-Persona-and-Immersive-Chat-Visuals.md §A.0) — who the user is playing as GLOBALLY
    // right now, distinct from `defaultPersonaId` (the home/star). Seeds new chats; never mutates an
    // already-open chat's own Anchor/Chat-persona pointers (§A.3).
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    currentPersonaId: z.string().nullable().catch(null).default(null),
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

/** Persona UX preferences (FINAL-Persona §A.6b — the ST `power_user.persona_show_notifications` parity
 *  global; the sort-order and auto-lock siblings are left client-side/deferred, and the ST
 *  multi-connections toggle is deliberately dropped — cruft, orb's junction is unconditional M:N).
 *  Additive namespace → `.prefault({})`, per-field `.catch()` → NO version bump. */
const personaSchema = z
  .object({
    /** Toast the caller when their `{{user}}` persona switches (Chat persona #3 changes, or a
     *  since-switched-persona read). A generic notification pref, not a chat-behavior default — kept
     *  out of `chatSchema` (that namespace is generation-behavior, ST `power_user` autoContinue/
     *  autoSwipe territory; this is UI chrome). */
    showNotifications: z.boolean().catch(true).default(true),
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

// ── Appearance (D44 §12.1 — the NON-color display surface; the committed §3.4 zod shape) ──
// DISPLAY-ONLY: every knob lands as a root `data-*` attr / CSS var read by the shell + the message
// render — it NEVER touches stored content (the content-processing knobs are PRESET territory, D53,
// per §12.1 "OUT"). User/AppSettings-level, not per-character; a per-character COLOR theme layers on
// top via the resolution order. `movingUI`/`waifuMode` are OUT (§12.1); sampling/instruct live on
// preset/connection. Additive namespace → `.prefault({})`, per-field `.catch()` → NO version bump.

// avatarSize/avatarShape/avatarAspect/avatarRing/messageActions are enumerated INLINE below (not
// exported tuples): `sm/md/lg` and `round/square` are generic control-scale members shared by
// unrelated ui axes (spinner/button/avatar sizes), so promoting them to a canonical `AVATAR_SIZES`
// tuple would (wrongly) force every sm/md/lg union to import it — the `no-inline-union-redecl` gate
// flags exactly that collision. These axes are single-consumer (this schema); the client form authors
// its own labelled Select options and pins their `value`s to the `AppearanceSettings` field type via
// `satisfies`. chatStyle/density DO derive from #theme — those ARE a shared cross-package axis with a
// real canonical home (D44 §12.5).

// Sizing bounds/defaults (named — `noMagicNumbers`). chatWidthPct feeds the §11.1
// `clamp(680px, Xdvw, 100dvw)` root var (the CSS floor makes the schema min cosmetic); fontScale is
// the global text-size multiplier. These numeric defaults are §3.4 LEANs (settle at the Phase-6 panel
// build); the SHAPE (field names, enums) is committed.
const CHAT_WIDTH_PCT_MIN = 30;
const CHAT_WIDTH_PCT_MAX = 100; // the §11.1 clamp caps at 100dvw
const CHAT_WIDTH_PCT_DEFAULT = 60;
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_DEFAULT = 1;
// D63 — the background scrim opacity bounds/default (named — `noMagicNumbers`). The mandatory scrim
// (never fully off) keeps text legible over any image; ~0.45 is the D49 §3 "default ~40-50%".
const BACKGROUND_DIM_MIN = 0;
const BACKGROUND_DIM_MAX = 1;
const BACKGROUND_DIM_DEFAULT = 0.45;
// Phase 4b §B.5.1 — the background-image BLUR axis, separate from the scrim (`backgroundDim`):
// `filter: blur()` on the PHOTO layer only (never `backdrop-filter`, which would also blur the scrim
// + content sitting above it). 0 = off (the default — a crisp photo, matching pre-4b behavior); px, not
// a token-scale enum, since this is a genuinely continuous user dial (mirrors `blurStrength` below).
const BACKGROUND_BLUR_MIN = 0;
const BACKGROUND_BLUR_MAX = 24;
const BACKGROUND_BLUR_DEFAULT = 0;

// WS3 (UI-Theming §12.1 effects) — the glass-effect PLACEMENT axis. Single-consumer (this schema +
// its one client form field), so it stays an inline tuple like avatarSize/avatarShape above, not a
// cross-package canonical (no other axis shares these four members). `messages` is available (ST
// parity — ST blurs message bubbles) but is NOT in the default-checked set: the Reading-Surface rule
// (Marinara DESIGN.md §4, stolen) forbids blur behind long reading text by DEFAULT — a user may still
// opt it in.
export const BLUR_SURFACES = ["panels", "composer", "messages", "modals"] as const;
export type BlurSurface = (typeof BLUR_SURFACES)[number];
/** The recommended starting set a client "quick enable" affordance seeds `blurSurfaces` with (pure
 *  chrome/overlays) — the schema itself still defaults to `[]` (OFF; §12.1 "flat stays default"). The
 *  Reading-Surface rule keeps `messages` out of this set; a user opts it in explicitly. */
export const DEFAULT_BLUR_SURFACES: readonly BlurSurface[] = ["panels", "composer", "modals"];

// D63 (amends D49 §3) — the app background-image axes, moved OFF the theme onto appearance (palette-
// independent). `kind` picks the source: `none` (color alone), `seeded` (a bundled placeholder from
// `packages/client/public/backgrounds/`), or `external` (a user-supplied URL). The `asset` (own upload)
// source is DROPPED here — no client asset-URL resolver/upload flow exists yet (#67/PD-131); the picker
// ships seeded|external. `fit` is how the photo fills the fixed-position root layer.
export const BACKGROUND_IMAGE_KINDS = ["none", "seeded", "external"] as const;
export type BackgroundImageKind = (typeof BACKGROUND_IMAGE_KINDS)[number];
export const APPEARANCE_BACKGROUND_FITS = ["cover", "contain"] as const;
export type AppearanceBackgroundFit = (typeof APPEARANCE_BACKGROUND_FITS)[number];

// Phase 4b §B.5.3 — granular reading-typography bounds/defaults (named — `noMagicNumbers`). Defaults
// MIRROR the design-system baseline (`tokens.json` `leading.body`/`spacing.block`) so a fresh user's
// sliders start exactly where the un-tuned message render already sits — zero visual change until moved.
const READING_LINE_HEIGHT_MIN = 1.2;
const READING_LINE_HEIGHT_MAX = 2.2;
const READING_LINE_HEIGHT_DEFAULT = 1.55; // mirrors tokens.json leading.body
const READING_LETTER_SPACING_MIN = -0.02;
const READING_LETTER_SPACING_MAX = 0.08;
const READING_LETTER_SPACING_DEFAULT = 0; // em
const READING_PARAGRAPH_SPACING_MIN = 0;
const READING_PARAGRAPH_SPACING_MAX = 3;
const READING_PARAGRAPH_SPACING_DEFAULT = 0.75; // rem, mirrors tokens.json spacing.block
const READING_NAME_SCALE_MIN = 0.8;
const READING_NAME_SCALE_MAX = 1.6;
const READING_BODY_SCALE_MIN = 0.8;
const READING_BODY_SCALE_MAX = 1.6;
const READING_SCALE_DEFAULT = 1;

// WS3/Phase-4b — the user-tunable glass blur RADIUS (px), separate from WHICH surfaces opt in
// (`blurSurfaces`). Mirrors `tokens.json` `blur.strength` (14px) as the default — a fresh user sees the
// exact same glass recipe as before this axis existed.
const BLUR_STRENGTH_MIN = 4;
const BLUR_STRENGTH_MAX = 28;
const BLUR_STRENGTH_DEFAULT = 14;

const appearanceSchema = z
  .object({
    // Sizing
    chatWidthPct: z
      .number()
      .int()
      .min(CHAT_WIDTH_PCT_MIN)
      .max(CHAT_WIDTH_PCT_MAX)
      .catch(CHAT_WIDTH_PCT_DEFAULT)
      .default(CHAT_WIDTH_PCT_DEFAULT),
    fontScale: z
      .number()
      .min(FONT_SCALE_MIN)
      .max(FONT_SCALE_MAX)
      .catch(FONT_SCALE_DEFAULT)
      .default(FONT_SCALE_DEFAULT),
    avatarSize: z.enum(["sm", "md", "lg"]).catch("md").default("md"),
    // "rounded" (rounded-rect) added §B.3 avatar versatility — a THIRD shape alongside round/square.
    avatarShape: z.enum(["round", "square", "rounded"]).catch("round").default("round"),
    // §B.3 — the presence lever the Phase-4 VN/immersive modes need (a tall sticky portrait instead
    // of a small round chip); `portrait` is the 2:3 smart-cropped variant (§B.4, already built).
    avatarAspect: z.enum(["square", "portrait"]).catch("square").default("square"),
    // §B.3 — an accent ring on the attribution avatar; reuse-ready for a future active-speaker
    // highlight (Moonlit's `is_fav`/`selected` glow).
    avatarRing: z.enum(["none", "accent"]).catch("none").default("none"),
    density: z.enum(THEME_DENSITIES).catch("comfortable").default("comfortable"), // §4 data-density axis
    // Surface elevation: `flat` = orb's default composition (no layered elevation ramp — a deliberate
    // COMPOSITION choice, not a ramp absence); `ramp` opts into the 3-tier elevation ramp (rail darkest →
    // list/context middle → content lightest; implemented by app-shell `shell.css` `[data-elevation=ramp]`
    // over the `--color-panel` token) for users who want the layered look. Display-only; never touches
    // stored content.
    elevation: z.enum(["flat", "ramp"]).catch("flat").default("flat"),
    // Message style (§12.1 — ST chatDisplay's 3 modes; the #theme-homed union)
    chatStyle: z.enum(THEME_CHAT_STYLES).catch("bubble").default("bubble"),
    // Per-message metadata visibility (§12.1 — "THE gap ST has and we lacked"; each → a data-*)
    showTimestamps: z.boolean().catch(true).default(true),
    showGenerationTimer: z.boolean().catch(false).default(false),
    showTokenCount: z.boolean().catch(false).default(false),
    showMessageId: z.boolean().catch(false).default(false),
    showModelIcon: z.boolean().catch(false).default(false),
    showInChatAvatars: z.boolean().catch(true).default(true),
    messageActions: z.enum(["expanded", "hover"]).catch("hover").default("hover"),
    // Markdown auto-fix on SETTLED messages (ST `auto_fix_generated_markdown` parity — a display-only
    // knob, NOT generation post-processing which lives on the preset per D53). Streaming ALWAYS repairs
    // (a mid-token-flash necessity); this toggles the same repair on settled bodies. Default OFF: a settled
    // body has complete markdown, so "repairing" a deliberate lone asterisk (censoring — `f*ck`) or
    // trailing `*` only mis-fires into a stray emphasis run. ON = ST-style auto-close for the power user
    // (note ST defaults this ON; orbweaver defaults OFF so the mis-fire doesn't bite by default).
    autoFixMarkdown: z.boolean().catch(false).default(false),
    // Effects (§12.1 — blur/shadow default OFF per the no-glass seed; manual reduced-motion beyond
    // the OS pref, §4a). WS3: `blurEffects: boolean` → `blurSurfaces: BlurSurface[]` (empty = off,
    // the PLACEMENT is user-chosen — glass-everywhere is opt-in, never default; see BLUR_SURFACES).
    blurSurfaces: z.array(z.enum(BLUR_SURFACES)).catch([]).default([]),
    shadowEffects: z.boolean().catch(false).default(false),
    reducedMotion: z.boolean().catch(false).default(false),
    // D63 (amends D49 §3): the app background image — moved off the theme; palette-independent, applied
    // at the app root beside glass. asset deferred (#67/PD-131); picker = seeded|external.
    backgroundImageKind: z.enum(BACKGROUND_IMAGE_KINDS).catch("none").default("none"),
    // biome-ignore lint/plugin/no-raw-id: not an entity FK — a seeded-background CATALOG slug (matched against the static `listSeededBackgrounds()` set at render), so it stays a plain slug string; an empty/stale value degrades to "no image" at resolution.
    backgroundSeededId: z
      .string()
      .regex(/^[a-z0-9-]*$/u)
      .catch("")
      .default(""),
    // URL-validated because it becomes a CSS `url()` — an invalid string degrades to "" (never an
    // injection vector), never applied raw.
    backgroundExternalUrl: z
      .string()
      .refine((s) => s === "" || z.url().safeParse(s).success)
      .catch("")
      .default(""),
    backgroundFit: z.enum(APPEARANCE_BACKGROUND_FITS).catch("cover").default("cover"),
    backgroundDim: z
      .number()
      .min(BACKGROUND_DIM_MIN)
      .max(BACKGROUND_DIM_MAX)
      .catch(BACKGROUND_DIM_DEFAULT)
      .default(BACKGROUND_DIM_DEFAULT),
    // Phase 4b §B.5.1 — blurs the PHOTO layer itself (`filter: blur()`, never `backdrop-filter` — the
    // scrim above it stays crisp). Composes with `backgroundDim`; 0 = off (byte-identical to pre-4b).
    backgroundBlur: z
      .number()
      .min(BACKGROUND_BLUR_MIN)
      .max(BACKGROUND_BLUR_MAX)
      .catch(BACKGROUND_BLUR_DEFAULT)
      .default(BACKGROUND_BLUR_DEFAULT),
    // Phase 4b §B.5.3 — granular reading-typography (Moonlit steal): per-message line-height/letter-
    // spacing/paragraph-spacing/name+body scale, + the justify toggle. Root vars via
    // `useAppearanceRootEffects` (reaches portals, the fontScale precedent), consumed on
    // `[data-slot="message-bubble"]`/`[data-slot="message-attribution"]` — never a per-row prop (the
    // reading surface stays crisp text/spacing only, THE READING-SURFACE RULE keeps blur off it).
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
    readingNameScale: z
      .number()
      .min(READING_NAME_SCALE_MIN)
      .max(READING_NAME_SCALE_MAX)
      .catch(READING_SCALE_DEFAULT)
      .default(READING_SCALE_DEFAULT),
    readingBodyScale: z
      .number()
      .min(READING_BODY_SCALE_MIN)
      .max(READING_BODY_SCALE_MAX)
      .catch(READING_SCALE_DEFAULT)
      .default(READING_SCALE_DEFAULT),
    justifyBodyText: z.boolean().catch(false).default(false),
    // Phase 4b §B.5.5 — opt-in: tint more UI chrome (borders/hairlines) from the accent color, beyond
    // the rationed default (D62 "accent on ≤10% of any viewport"). Root data-attr, off by default.
    enableThemeColorization: z.boolean().catch(false).default(false),
    // Phase 4b §B.5.5 — the glass blur RADIUS as a user dial (WS3 built the recipe; this exposes its
    // one previously-fixed knob). Root var `--blur-strength`, overriding the tokens.json default.
    blurStrength: z
      .number()
      .min(BLUR_STRENGTH_MIN)
      .max(BLUR_STRENGTH_MAX)
      .catch(BLUR_STRENGTH_DEFAULT)
      .default(BLUR_STRENGTH_DEFAULT),
    // Phase 4b §B.5.5 — a metadata chip/icon on the reasoning-block disclosure (mirrors the
    // showModelIcon/showTokenCount message-metadata chip pattern). Off by default (quiet chrome).
    showLLMReasoningIcon: z.boolean().catch(false).default(false),
  })
  .prefault({});

/** The resolved appearance prefs (every field present — the namespace `.prefault({})`s to defaults). */
export type AppearanceSettings = z.infer<typeof appearanceSchema>;

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
  /** Persona UX prefs (FINAL-Persona §A.6b). Additive namespace, NO version bump. */
  persona: personaSchema,
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
  /** Display-only appearance prefs (D44 §12.1). Additive namespace, NO version bump — the lenient
   *  parser prefaults it; each knob is a root `data-*`/CSS-var read by the shell + message render. */
  appearance: appearanceSchema,
  /** Which theme is active (themes-design.md §3.3). Additive namespace, NO version bump. */
  theme: themeSettingsSchema,
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
  "persona",
  "groupDefaults",
  "onboarding",
  "workloads",
  "profile",
  "appearance",
  "theme",
] as const;
export type UserSettingsSection = (typeof USER_SETTINGS_SECTIONS)[number];

/** The fully-defaulted settings object (what a brand-new / empty user resolves to). */
export const DEFAULT_USER_SETTINGS: UserSettings = userSettingsSchema.parse({});

/** The fully-defaulted appearance prefs — the client's fallback while `getUserSettings` loads (the
 *  render seams read this so an unauthed/pending state degrades to the ST-parity defaults, never a
 *  flicker of undefined). Derived from the ONE schema (never a hand-kept mirror). */
export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = DEFAULT_USER_SETTINGS.appearance;

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
  /** D44 §12.0 — deployment-wide render-trust default (resolved). `true` = rich HTML/Mermaid render as
   *  trusted globally; a per-character `trustHtml` still overrides. Floor: `false` (untrusted). */
  trustHtml: boolean;
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
  /** Max bytes for a generated-image download (born-in-DB; the imagery `fetchImage` port reads it live to
   *  cap the provider-URL fetch). Floor: `DEFAULT_MAX_IMAGE_BYTES` (5 MB). */
  maxImageBytes: number;
}
