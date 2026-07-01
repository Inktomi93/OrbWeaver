import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { AppSettings, UserSettings } from "@orb/contracts/settings";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  appSettingsSchema,
  DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  DEFAULT_USER_SETTINGS,
  LOG_LEVELS,
  parseAppSettings,
  parseUserSettings,
  USER_SETTINGS_SCHEMA_VERSION,
  USER_SETTINGS_SECTIONS,
  userSettingsSchema,
} from "@orb/contracts/settings";
import { expect, test } from "../../support/fixtures";

const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
const LOCAL_COMPUTE_BUDGET = 50;
const SAMPLE_SCAN_DEPTH = 12;

// ── D17 owner-box governance toggles (the headline deviation: exist + the right floor defaults) ──

test("D17 toggles exist on AppSettings with the right floor defaults (local ON, max-pro-sub OFF)", () => {
  expect(DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE).toBe(true);
  expect(DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB).toBe(false);
});

test("D17 toggle fields parse (incl. the per-member local-compute COUNT budget)", () => {
  const override: AppSettings = {
    allowNonOwnerLocalCompute: false,
    allowNonOwnerMaxProSub: true,
    nonOwnerLocalComputeBudget: LOCAL_COMPUTE_BUDGET,
  };
  const parsed = parseAppSettings(override);
  expect(parsed.allowNonOwnerLocalCompute).toBe(false);
  expect(parsed.allowNonOwnerMaxProSub).toBe(true);
  expect(parsed.nonOwnerLocalComputeBudget).toBe(LOCAL_COMPUTE_BUDGET);
});

// ── The `null` = CLEAR sentinel: every AppSettings field admits null ──

test("appSettingsSchema admits null per field (the CLEAR sentinel)", () => {
  const cleared: AppSettings = {
    corpusAutoindex: null,
    importSkipCharacters: null,
    logLevel: null,
    forbidExternalMedia: null,
    memoryDefaults: null,
    memorySummarizer: null,
    rateLimits: null,
    vllmConcurrency: null,
    allowNonOwnerLocalCompute: null,
    nonOwnerLocalComputeBudget: null,
    allowNonOwnerMaxProSub: null,
  };
  expect(appSettingsSchema.parse(cleared)).toEqual(cleared);
});

// ── Lenient parse: garbage degrades to the default (never throws) ──

test("parseAppSettings degrades a non-object / garbage blob to {} (no overrides)", () => {
  expect(parseAppSettings(null)).toEqual({});
  expect(parseAppSettings("nonsense")).toEqual({});
  // A field with a malformed value is swallowed by its `.catch` rather than nuking the blob.
  expect(parseAppSettings({ logLevel: "loud", corpusAutoindex: true })).toEqual({
    corpusAutoindex: true,
  });
});

test("parseUserSettings degrades a non-object / garbage blob to the full defaults", () => {
  expect(parseUserSettings(null)).toEqual(DEFAULT_USER_SETTINGS);
  expect(parseUserSettings(42)).toEqual(DEFAULT_USER_SETTINGS);
});

// ── The versioned-config lift walk (AppSettings v1→v2 strips memorySummarizer.source) ──

test("AppSettings v1→v2 lift strips the dropped memorySummarizer.source", () => {
  const storedV1 = {
    schemaVersion: SCHEMA_VERSION_V1,
    memorySummarizer: { source: "hosted", maxTokens: 256 },
  };
  const parsed = parseAppSettings(storedV1);
  expect(parsed.memorySummarizer).toEqual({ maxTokens: 256 });
});

// ── storedVersion (the DB column) BEATS the in-blob probe (the corruption guard) ──

test("UserSettings v1→v2 lift folds defaultApi/Source/Model into routing.roleDefaults.chat", () => {
  const storedV1 = {
    schemaVersion: SCHEMA_VERSION_V1,
    defaultApi: "chat-completions",
    defaultSource: "openrouter",
    defaultModel: "some-model",
  };
  const parsed = parseUserSettings(storedV1);
  expect(parsed.routing.roleDefaults.chat).toEqual({
    api: "chat-completions",
    source: "openrouter",
    model: "some-model",
  });
});

test("storedVersion beats the in-blob probe: a v2 blob with no in-blob version does NOT re-run the v1 lift", () => {
  // A v2-shaped blob (already namespaced) with NO in-blob schemaVersion. Without the column override it
  // would probe as v1 and the flat-grab-bag lift would run, corrupting the already-migrated shape.
  const v2Blob = {
    routing: { roleDefaults: { chat: { source: "openrouter" } } },
    worldInfo: { scanDepth: SAMPLE_SCAN_DEPTH },
  };
  const parsed = parseUserSettings(v2Blob, SCHEMA_VERSION_V2);
  expect(parsed.worldInfo.scanDepth).toBe(SAMPLE_SCAN_DEPTH);
  expect(parsed.routing.roleDefaults.chat?.source).toBe("openrouter");
});

// ── Per-role source subsets mirror the providers firewall (D39 — local-light is routable) ──

test("embed/rerank/imageEmbed roleDefaults accept the three inference sources incl. local-light (D39)", () => {
  for (const role of ["embed", "rerank", "imageEmbed"] as const) {
    for (const source of ["openrouter", "vllm", "local-light"] as const) {
      const parsed = parseUserSettings(
        { routing: { roleDefaults: { [role]: { source } } } },
        SCHEMA_VERSION_V2,
      );
      expect(parsed.routing.roleDefaults[role]?.source).toBe(source);
    }
  }
});

test("summarize roleDefault rejects local-light (chat-less tier) — heals to no preference", () => {
  // The subset omits local-light; an invalid stored source drops via the optional arm (no throw).
  const parsed = parseUserSettings(
    { routing: { roleDefaults: { summarize: { source: "local-light" } } } },
    SCHEMA_VERSION_V2,
  );
  expect(parsed.routing.roleDefaults.summarize?.source).toBeUndefined();
});

// ── groupDefaults carries the D22 memberCardVisibility default 'sheet' ──

test("UserSettings.groupDefaults carries the D22 memberCardVisibility default 'sheet'", () => {
  expect(DEFAULT_USER_SETTINGS.groupDefaults).toEqual(DEFAULT_GROUP_CONFIG);
  expect(DEFAULT_USER_SETTINGS.groupDefaults.memberCardVisibility).toBe("sheet");
});

// ── Additive namespaces read their default with NO version bump (the lenient-parser dividend) ──

test("additive namespaces (onboarding/groupDefaults/workloads/profile) read defaults from an empty blob", () => {
  const parsed = parseUserSettings({});
  expect(parsed.onboarding).toEqual(DEFAULT_USER_SETTINGS.onboarding);
  expect(parsed.workloads).toEqual(DEFAULT_USER_SETTINGS.workloads);
  expect(parsed.profile).toEqual(DEFAULT_USER_SETTINGS.profile);
  expect(parsed.groupDefaults).toEqual(DEFAULT_GROUP_CONFIG);
});

// ── LogLevel is the ONE tuple (foundation/env mirrors it) + section unions ──

test("LOG_LEVELS is the canonical tuple and userSettingsSchema round-trips the defaults", () => {
  expect(LOG_LEVELS).toContain("info");
  expect(LOG_LEVELS).toContain("silent");
  const roundTripped: UserSettings = userSettingsSchema.parse(DEFAULT_USER_SETTINGS);
  expect(roundTripped).toEqual(DEFAULT_USER_SETTINGS);
});

test("USER_SETTINGS_SECTIONS excludes the whole-value tiers (regexScripts, schemaVersion)", () => {
  expect(USER_SETTINGS_SECTIONS).not.toContain("regexScripts");
  expect(USER_SETTINGS_SECTIONS).not.toContain("schemaVersion");
  expect(USER_SETTINGS_SECTIONS).toContain("groupDefaults");
});

test("the schema versions are the pinned v2 (both tiers)", () => {
  expect(APP_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V2);
  expect(USER_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V2);
});
