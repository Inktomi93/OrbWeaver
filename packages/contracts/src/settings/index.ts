// `@orb/contracts/settings` — the two DB-backed config tiers: per-user `UserSettings` and admin-runtime
// `AppSettings`, both built on `defineVersionedConfig`. The domain owns the verbs/resolver/serializers.

import { isPlainObject } from "@orb/kit/guards";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { DEFAULT_GROUP_CONFIG, groupConfigSchema } from "#chat";
import { chatApiSchema, openRouterProviderRoutingSchema } from "#connection";
import { credentialSourceSchema } from "#credentials";
import { regexScriptSchema } from "#regex";
import { MEMORY_RETRIEVAL_MODES } from "#search";
// BG-C: the background source-kind vocabulary (`BACKGROUND_IMAGE_KINDS` / `BackgroundImageKind`) is homed in
// `#theme` (shared with the carried `ThemeBackground` twin); consumers import it from `@orb/contracts/theme`.
import { BACKGROUND_IMAGE_KINDS, THEME_CHAT_STYLES, THEME_DENSITIES } from "#theme";
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

export const APP_SETTINGS_SCHEMA_VERSION = 2;

const SCORE_FLOOR = 0;
const SCORE_CEIL = 1;
const RECENCY_BIAS_FLOOR = 0;
const TEMPERATURE_FLOOR = 0;
const TEMPERATURE_CEIL = 2;

export const memoryDefaultsSchema = z.object({
  blockSize: z.number().int().positive().optional().describe("Messages per tier-0 digest block (default 8; ≈3k BGE tok, under the 8192 cap)."),
  verbatimWindow: z.number().int().nonnegative().optional().describe("Recent messages never digested — the protect zone / seam buffer (default 8)."),
  queryWindow: z.number().int().positive().optional().describe("Recent messages used as the retrieval query for mixB/mixC (default 2)."),
  mode: z
    .enum(MEMORY_RETRIEVAL_MODES)
    .optional()
    .describe("off | mixA (all tier-0, chronological) | mixB (+vector retrieve) | mixC (+rerank) | tiered (consolidation bridge). Default mixC."),
  fanOut: z.number().int().positive().optional().describe("Tier-k digests consolidated into one tier-(k+1) digest (default 4)."),
  maxTier: z.number().int().nonnegative().optional().describe("Max consolidation depth; 0 = tier-0 only (default 3)."),
  retrieveK: z.number().int().positive().optional().describe("Vector candidate pool size for mixB/mixC (default 8)."),
  rerankTo: z.number().int().positive().optional().describe("Digests kept after cross-encoder rerank in mixC (default 3)."),
  minScore: z.number().min(SCORE_FLOOR).max(SCORE_CEIL).optional().describe("Minimum cosine similarity for a retrieved digest (default 0.25)."),
  keywordMatch: z.boolean().optional().describe("Also match digest keywords whole-word against recent messages (default true)."),
  recencyBias: z.number().min(RECENCY_BIAS_FLOOR).optional().describe("Mild score boost toward recent digests in mixB/mixC (default 0 = off)."),
});
export type MemoryDefaults = z.infer<typeof memoryDefaultsSchema>;

export const memorySummarizerSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(TEMPERATURE_FLOOR).max(TEMPERATURE_CEIL).optional(),
});
export type MemorySummarizerConfig = z.infer<typeof memorySummarizerSchema>;

export const rateLimitsSchema = z.object({
  general: z.number().int().positive().optional(),
  aiTurn: z.number().int().positive().optional(),
  publicIp: z.number().int().positive().optional(),
  authed: z.number().int().positive().optional(),
});
export type RateLimits = z.infer<typeof rateLimitsSchema>;

export const vllmConcurrencySchema = z.object({
  embed: z.number().int().positive().optional(),
  summarize: z.number().int().positive().optional(),
});
export type VllmConcurrency = z.infer<typeof vllmConcurrencySchema>;

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
  allowNonOwnerLocalCompute: z.boolean().nullable().optional().catch(undefined),
  nonOwnerLocalComputeBudget: z.number().int().positive().nullable().optional().catch(undefined),
  maxImageBytes: z.number().int().min(MAX_IMAGE_BYTES_FLOOR).max(MAX_IMAGE_BYTES_CEIL).nullable().optional().catch(undefined),
  allowNonOwnerMaxProSub: z.boolean().nullable().optional().catch(undefined),
  localMultiUser: z.boolean().nullable().optional().catch(undefined),
  discreetLogin: z.boolean().nullable().optional().catch(undefined),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

const APP_SETTINGS_LIFTS: Record<number, (config: Record<string, unknown>) => Record<string, unknown>> = {
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
const inferenceRoleConfigSchema = z.object({
  source: inferenceRoleSourceSchema.optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
});
const summarizeRoleConfigSchema = z.object({
  source: z.enum(SUMMARIZE_SOURCES).optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
});
const generateImageRoleConfigSchema = z.object({
  source: z.enum(GENERATE_IMAGE_SOURCES).optional().catch(undefined),
  model: z.string().min(1).optional().catch(undefined),
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
    // api-unpin) — the agent's api is NOT server-pinned. Solo buddy validates the resolved api at its entry.
    agent: chatRoleConfigSchema.optional(),
    embed: inferenceRoleConfigSchema.optional(),
    rerank: inferenceRoleConfigSchema.optional(),
    imageEmbed: inferenceRoleConfigSchema.optional(),
    summarize: summarizeRoleConfigSchema.optional(),
    generateImage: generateImageRoleConfigSchema.optional(),
  })
  .prefault({});

export const USER_SETTINGS_SCHEMA_VERSION = 4;

const SCAN_DEPTH_MIN = 1;
const SCAN_DEPTH_MAX = 200;
const SCAN_DEPTH_DEFAULT = 6;
const WI_TOKEN_BUDGET_MIN = 0;
const WI_TOKEN_BUDGET_MAX = 65_536;
const WI_TOKEN_BUDGET_DEFAULT = 1024;
const AUTO_SWIPE_MIN_LENGTH_DEFAULT = 0;
// Smooth-stream pacing (client-honored — `@orb/ui/stream` useSmoothText): the trickle floor in chars/sec.
// Range mirrors neo's Streaming pref; default OFF so the reveal tracks raw chunk cadence unless opted in.
const SMOOTH_STREAM_CPS_MIN = 15;
const SMOOTH_STREAM_CPS_MAX = 300;
const SMOOTH_STREAM_CPS_DEFAULT = 80;
const DUP_THRESHOLD_FLOOR = 0;
const DUP_THRESHOLD_CEIL = 1;
const COMPUTE_THEMES_K_MAX = 100;

const routingSchema = z.object({ roleDefaults: roleDefaultsSchema }).prefault({});

const themeSettingsSchema = z
  .object({
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — a stale/deleted theme id degrades to the Hearth default at resolution (the profile.avatarAssetId precedent), so it stays plain; null = "the default palette" (no sentinel id leaked into contracts).
    selectedThemeId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});

const seedsSchema = z
  .object({
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    defaultPersonaId: z.string().nullable().catch(null).default(null),
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    currentPersonaId: z.string().nullable().catch(null).default(null),
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — a stale/deleted id degrades at consumption (not a validated entity boundary), so it stays plain.
    welcomeAssistantCharacterId: z.string().nullable().catch(null).default(null),
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — a stale/unowned id degrades to the system-default preset at consumption, so it stays plain.
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

// Stream-display scroll behavior (PD-147, client-honored — the `@orb/ui/message-list` `scrollMode` prop).
// `follow` = the sealed sticky-tail behavior. `pin-prompt` = ChatGPT-style: on send, pin the just-sent
// message to the viewport top and hold it while the reply streams below. Default `follow` (byte-identical
// for untouched users). The `@orb/ui` prop union pairs with this tuple at the consumer (compile-time).
export const STREAM_SCROLL_MODES = ["follow", "pin-prompt"] as const;
export type StreamScrollMode = (typeof STREAM_SCROLL_MODES)[number];

const chatSchema = z
  .object({
    // Client-honored (composer keydown): Enter sends by default; off → Enter is a newline and ⌘/Ctrl+Enter sends.
    enterSends: z.boolean().catch(true).default(true),
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
    // Client-honored (the streaming ghost's `useSmoothText` pacer). Default OFF: raw chunk cadence.
    smoothStream: z.boolean().catch(false).default(false),
    smoothStreamCps: z.number().int().min(SMOOTH_STREAM_CPS_MIN).max(SMOOTH_STREAM_CPS_MAX).catch(SMOOTH_STREAM_CPS_DEFAULT).default(SMOOTH_STREAM_CPS_DEFAULT),
    // Client-honored (the MessageList `scrollMode`). Default `follow`: today's sealed sticky-tail behavior.
    streamScrollMode: z.enum(STREAM_SCROLL_MODES).catch("follow").default("follow"),
  })
  .prefault({});

export type ChatSettings = z.infer<typeof chatSchema>;

const personaSchema = z
  .object({
    showNotifications: z.boolean().catch(true).default(true),
  })
  .prefault({});

const workloadsSchema = z
  .object({
    dupThreshold: z.number().min(DUP_THRESHOLD_FLOOR).max(DUP_THRESHOLD_CEIL).optional().catch(undefined),
    computeThemesK: z.number().int().positive().max(COMPUTE_THEMES_K_MAX).optional().catch(undefined),
  })
  .prefault({});

const onboardingSchema = z
  .object({
    personaWizardSeen: z.boolean().catch(false).default(false),
    defaultCharactersSeeded: z.boolean().catch(false).default(false),
    defaultPersonaSeeded: z.boolean().catch(false).default(false),
  })
  .prefault({});

const profileSchema = z
  .object({
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — a stale/deleted asset id degrades at consumption (not a validated entity boundary), so it stays plain.
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
// `messages` deliberately excluded from the default set — Reading-Surface rule forbids blur behind
// long reading text by default; a user may still opt it in.
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
  // @orb-gate-ignore no-raw-id not an entity FK — a blob-internal per-ROW ui identity, the SAME shape as the sibling client-minted blob-row ids (`regex.scripts[].id`, preset `sections[].id` — plain `crypto.randomUUID()`), and the sibling lenient UserSettings-tier `*Id` exemptions in this file. A branded kit/ids TypeID does NOT fit: the row is minted CLIENT-side (no client TypeID minter) and the v3→v4 backfill is DETERMINISTIC (`${assetId}:${index}`, so it's stable across the reads that re-run the lift before the first v4 write) — neither is a mintable `prefix_…` TypeID.
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

export const CHAT_LAYOUTS = ["classic"] as const;
export type ChatLayout = (typeof CHAT_LAYOUTS)[number];

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
    chatLayout: z.enum(CHAT_LAYOUTS).catch("classic").default("classic"),
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
    blurSurfaces: z.array(z.enum(BLUR_SURFACES)).catch([]).default([]),
    shadowEffects: z.boolean().catch(false).default(false),
    surfaceTexture: z.enum(SURFACE_TEXTURES).catch("none").default("none"),
    reducedMotion: z.boolean().catch(false).default(false),
    backgroundImageKind: z.enum(BACKGROUND_IMAGE_KINDS).catch("none").default("none"),
    // @orb-gate-ignore no-raw-id not an entity FK — a seeded-background CATALOG slug (matched against the static `listSeededBackgrounds()` set at render), so it stays a plain slug string; an empty/stale value degrades to "no image" at resolution.
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
    // @orb-gate-ignore no-raw-id lenient UserSettings tier — the own-upload background asset id (kind `asset`). A stale/deleted value degrades to "no image" at resolution (the `profile.avatarAssetId` precedent); the LIVE value is GC-rooted by the settings live-source scan (`domain/assets/persistence/asset-refs.ts`), not an FK boundary.
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

// The owner-global regex script library — its OWN object section (`config.regex.scripts`) so the
// section-update machinery can address it (sections deep-merge object patches; a bare top-level array
// could not be section-patched). v2→v3 lift moved it out of the top-level `regexScripts` array.
const regexSettingsSchema = z
  .object({
    scripts: z.array(regexScriptSchema).catch([]).default([]),
  })
  .prefault({});

export type RegexSettings = z.infer<typeof regexSettingsSchema>;

export const userSettingsSchema = z.object({
  // The DB also pins a `user_settings.schemaVersion` COLUMN (`storedVersion`), which BEATS this in-blob
  // value so a client can't spoof past a lift.
  schemaVersion: z.number().int().positive().default(USER_SETTINGS_SCHEMA_VERSION),
  routing: routingSchema,
  seeds: seedsSchema,
  worldInfo: worldInfoSchema,
  memory: memorySchema,
  chat: chatSchema,
  persona: personaSchema,
  groupDefaults: groupConfigSchema.catch(DEFAULT_GROUP_CONFIG).default(DEFAULT_GROUP_CONFIG),
  onboarding: onboardingSchema,
  regex: regexSettingsSchema,
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
  "chat",
  "persona",

  "groupDefaults",
  "onboarding",
  "regex",
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
  general: number;
  aiTurn: number;
  publicIp: number;
  authed: number;
}

export interface ResolvedVllmConcurrency {
  embed: number;
  summarize: number;
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
  allowNonOwnerLocalCompute: boolean;
  nonOwnerLocalComputeBudget: number | null;
  allowNonOwnerMaxProSub: boolean;
  localMultiUser: boolean;
  discreetLogin: boolean;
  maxImageBytes: number;
}
