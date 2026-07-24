import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { AppSettings, UserSettings } from "@orb/contracts/settings";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  appSettingsSchema,
  DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_USER_SETTINGS,
  LOG_LEVELS,
  parseAppSettings,
  parseUserSettings,
  STREAM_SCROLL_MODES,
  USER_SETTINGS_SCHEMA_VERSION,
  USER_SETTINGS_SECTIONS,
  userSettingsSchema,
} from "@orb/contracts/settings";
import { expect, test } from "../../support/fixtures";

const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;
const SCHEMA_VERSION_V4 = 4;
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
    trustHtml: null,
    memoryDefaults: null,
    memorySummarizer: null,
    rateLimits: null,
    vllmConcurrency: null,
    allowNonOwnerLocalCompute: null,
    nonOwnerLocalComputeBudget: null,
    allowNonOwnerMaxProSub: null,
    maxImageBytes: null,
  };
  expect(appSettingsSchema.parse(cleared)).toEqual(cleared);
});

// ── maxImageBytes — the generated-image download cap (born-in-DB deployment knob) ──

test("DEFAULT_MAX_IMAGE_BYTES is the 5 MB floor (unchanged out-of-the-box behavior)", () => {
  expect(DEFAULT_MAX_IMAGE_BYTES).toBe(5_000_000);
});

test("maxImageBytes parses a valid override and self-heals out-of-bounds values (.catch → undefined)", () => {
  expect(parseAppSettings({ maxImageBytes: 20_000_000 }).maxImageBytes).toBe(20_000_000);
  // Below the floor and above the ceiling both swallow via `.catch` (the field drops; the resolver
  // then reads DEFAULT_MAX_IMAGE_BYTES) — an absurd/unbounded cap can never be stored.
  expect(parseAppSettings({ maxImageBytes: 1 }).maxImageBytes).toBeUndefined();
  expect(parseAppSettings({ maxImageBytes: 999_999_999 }).maxImageBytes).toBeUndefined();
  expect(parseAppSettings({ maxImageBytes: 1.5 }).maxImageBytes).toBeUndefined(); // non-int
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
      const parsed = parseUserSettings({ routing: { roleDefaults: { [role]: { source } } } }, SCHEMA_VERSION_V2);
      expect(parsed.routing.roleDefaults[role]?.source).toBe(source);
    }
  }
});

test("summarize roleDefault rejects local-light (chat-less tier) — heals to no preference", () => {
  // The subset omits local-light; an invalid stored source drops via the optional arm (no throw).
  const parsed = parseUserSettings({ routing: { roleDefaults: { summarize: { source: "local-light" } } } }, SCHEMA_VERSION_V2);
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

// ── persona (FINAL-Persona §A.6b) — the additive persona-UX namespace ──

test("UserSettings.persona.showNotifications defaults true from an empty blob (no version bump)", () => {
  const parsed = parseUserSettings({});
  expect(parsed.persona.showNotifications).toBe(true);
  expect(DEFAULT_USER_SETTINGS.persona.showNotifications).toBe(true);
});

test("USER_SETTINGS_SECTIONS includes persona (section-patchable via updateUserSettingsSection)", () => {
  expect(USER_SETTINGS_SECTIONS).toContain("persona");
});

// ── chat (PD-146) — the client-honored send/continue/stream behavior namespace ──

test("UserSettings.chat reads the PD-146 defaults from an empty blob (Enter sends, smooth-stream off)", () => {
  const parsed = parseUserSettings({});
  expect(parsed.chat.enterSends).toBe(true);
  expect(parsed.chat.continueOnSend).toBe(true);
  expect(parsed.chat.autoContinue).toBe(false);
  expect(parsed.chat.smoothStream).toBe(false);
  expect(parsed.chat.smoothStreamCps).toBe(80);
  expect(DEFAULT_USER_SETTINGS.chat.enterSends).toBe(true);
  expect(DEFAULT_USER_SETTINGS.chat.smoothStream).toBe(false);
});

test("UserSettings.chat.smoothStreamCps self-heals an out-of-bounds value to the default (.catch)", () => {
  // Stamp the current version so the v1 lift (which rebuilds the chat namespace) doesn't run.
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { smoothStreamCps: 9999 } }).chat.smoothStreamCps).toBe(80);
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { smoothStreamCps: 150 } }).chat.smoothStreamCps).toBe(150);
});

test("UserSettings.chat.streamScrollMode defaults to follow (byte-identical) and accepts pin-prompt (PD-147)", () => {
  expect(parseUserSettings({}).chat.streamScrollMode).toBe("follow");
  expect(DEFAULT_USER_SETTINGS.chat.streamScrollMode).toBe("follow");
  expect(STREAM_SCROLL_MODES).toEqual(["follow", "pin-prompt"]);
  // Stamp the current version so the v1 lift (which rebuilds the chat namespace) doesn't run.
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { streamScrollMode: "pin-prompt" } }).chat.streamScrollMode).toBe("pin-prompt");
  // A garbage mode self-heals to follow (.catch).
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { streamScrollMode: "warp-speed" } }).chat.streamScrollMode).toBe("follow");
});

// ── appearance (D44 §12.1) — the additive display-only namespace ──

test("UserSettings.appearance reads the §12.1 defaults from an empty blob (no version bump)", () => {
  const parsed = parseUserSettings({});
  // Sizing + message style
  expect(parsed.appearance.chatWidthPct).toBe(60);
  expect(parsed.appearance.fontScale).toBe(1);
  expect(parsed.appearance.avatarSize).toBe("md");
  expect(parsed.appearance.avatarShape).toBe("round");
  expect(parsed.appearance.avatarAspect).toBe("square"); // §B.3 avatar versatility
  expect(parsed.appearance.avatarRing).toBe("none");
  expect(parsed.appearance.density).toBe("comfortable");
  expect(parsed.appearance.chatStyle).toBe("bubble"); // the ST-parity default
  expect(parsed.appearance.chatLayout).toBe("classic"); // VN-1 — the standard thread until opted into VN
  // Metadata visibility (timestamps + in-chat avatars ON; the rest OFF)
  expect(parsed.appearance.showTimestamps).toBe(true);
  expect(parsed.appearance.showInChatAvatars).toBe(true);
  expect(parsed.appearance.showTokenCount).toBe(false);
  expect(parsed.appearance.messageActions).toBe("hover");
  // Effects default OFF (the no-glass seed)
  expect(parsed.appearance.blurSurfaces).toEqual([]);
  expect(parsed.appearance.shadowEffects).toBe(false);
  expect(parsed.appearance.reducedMotion).toBe(false);
  // An empty blob parses as the pinned CURRENT version (the point here is "current", not the literal).
  expect(parsed.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
});

test("UserSettings.appearance self-heals per-field: a garbage knob degrades to its default (.catch)", () => {
  // storedVersion = the current version (the `user_settings.schemaVersion` column) so the v1→v2 lift
  // is skipped and the per-field `.catch` on the CURRENT schema is what's exercised (a real re-parse
  // of a stored v2 row — a versionless blob would instead lift-then-default, dropping this namespace).
  const parsed = parseUserSettings(
    {
      appearance: {
        chatStyle: "hologram", // not a THEME_CHAT_STYLES member → catch → "bubble"
        chatLayout: "hologram", // not a CHAT_LAYOUTS member → catch → "classic"
        avatarSize: "enormous", // not sm/md/lg → catch → "md"
        avatarAspect: "landscape", // not square/portrait → catch → "square"
        chatWidthPct: 5000, // over the max → catch → 60
        fontScale: 99, // over the max → catch → 1
        showTimestamps: "yes", // not a boolean → catch → true (the default)
        density: "roomy", // not a THEME_DENSITIES member → catch → "comfortable"
      },
    },
    USER_SETTINGS_SCHEMA_VERSION,
  );
  expect(parsed.appearance.chatStyle).toBe("bubble");
  expect(parsed.appearance.chatLayout).toBe("classic");
  expect(parsed.appearance.avatarSize).toBe("md");
  expect(parsed.appearance.avatarAspect).toBe("square");
  expect(parsed.appearance.chatWidthPct).toBe(60);
  expect(parsed.appearance.fontScale).toBe(1);
  expect(parsed.appearance.showTimestamps).toBe(true);
  expect(parsed.appearance.density).toBe("comfortable");
});

test("UserSettings.appearance keeps valid overrides while healing invalid siblings", () => {
  const parsed = parseUserSettings({ appearance: { chatStyle: "document", avatarShape: "square", chatWidthPct: "bad" } }, USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.appearance.chatStyle).toBe("document");
  expect(parsed.appearance.avatarShape).toBe("square");
  expect(parsed.appearance.chatWidthPct).toBe(60); // the healed sibling
});

test("UserSettings.appearance accepts the new avatarShape=rounded + avatarAspect/avatarRing values (§B.3)", () => {
  const parsed = parseUserSettings({ appearance: { avatarShape: "rounded", avatarAspect: "portrait", avatarRing: "accent" } }, USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.appearance.avatarShape).toBe("rounded");
  expect(parsed.appearance.avatarAspect).toBe("portrait");
  expect(parsed.appearance.avatarRing).toBe("accent");
});

test("USER_SETTINGS_SECTIONS includes appearance (section-patchable via updateUserSettingsSection)", () => {
  expect(USER_SETTINGS_SECTIONS).toContain("appearance");
});

// ── LogLevel is the ONE tuple (foundation/env mirrors it) + section unions ──

test("LOG_LEVELS is the canonical tuple and userSettingsSchema round-trips the defaults", () => {
  expect(LOG_LEVELS).toContain("info");
  expect(LOG_LEVELS).toContain("silent");
  const roundTripped: UserSettings = userSettingsSchema.parse(DEFAULT_USER_SETTINGS);
  expect(roundTripped).toEqual(DEFAULT_USER_SETTINGS);
});

test("USER_SETTINGS_SECTIONS includes the regex section and excludes schemaVersion", () => {
  // regex became a real object section (`config.regex.scripts`) so it's section-patchable; the retired
  // top-level `regexScripts` array is gone.
  expect(USER_SETTINGS_SECTIONS).toContain("regex");
  expect(USER_SETTINGS_SECTIONS).not.toContain("regexScripts");
  expect(USER_SETTINGS_SECTIONS).not.toContain("schemaVersion");
  expect(USER_SETTINGS_SECTIONS).toContain("groupDefaults");
});

test("UserSettings v2→v3 lift moves the top-level regexScripts array into the regex section", () => {
  const script = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "strip ooc",
    findRegex: "\\(ooc\\)",
    replaceString: "",
    placement: [],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
  };
  // A stored v2 row (column = 2) with the OLD top-level array + a sibling namespace to prove it survives.
  const storedV2 = { regexScripts: [script], worldInfo: { scanDepth: SAMPLE_SCAN_DEPTH } };
  const parsed = parseUserSettings(storedV2, SCHEMA_VERSION_V2);
  expect(parsed.regex.scripts).toHaveLength(1);
  expect(parsed.regex.scripts[0]?.id).toBe(script.id);
  expect(parsed.worldInfo.scanDepth).toBe(SAMPLE_SCAN_DEPTH);
  // The retired top-level key is gone from the parsed shape.
  expect(parsed).not.toHaveProperty("regexScripts");
});

test("v3→v4 lift backfills a DETERMINISTIC entryId on each backgroundLibrary entry (F-P2) — unique even for byte-identical dupes, idempotent", () => {
  const dupAsset = "asset_01h455vb4pex5vsknk084sn02q"; // TWO entries share it (byte-identical uploads → same CAS assetId)
  const withEntryId = "asset_01j0000000000000000000000j";
  const storedV3 = {
    appearance: {
      backgroundLibrary: [
        { assetId: dupAsset, assetHash: "hash_x", mime: "image/png", name: "one" },
        { assetId: dupAsset, assetHash: "hash_x", mime: "image/png", name: "two" },
        { entryId: "kept_uuid", assetId: withEntryId, assetHash: "hash_y", mime: "image/png", name: "three" },
      ],
    },
  };
  const lib = parseUserSettings(storedV3, SCHEMA_VERSION_V3).appearance.backgroundLibrary;
  expect(lib).toHaveLength(3);
  // Deterministic `${assetId}:${index}` — unique across the byte-identical pair (the collision the row-id fixes),
  // and STABLE across reads (a random uuid would differ every parse before the first v4 write).
  expect(lib[0]?.entryId).toBe(`${dupAsset}:0`);
  expect(lib[1]?.entryId).toBe(`${dupAsset}:1`);
  expect(lib[0]?.entryId).not.toBe(lib[1]?.entryId);
  // An entry already carrying an entryId keeps it (idempotent — the lift never re-mints).
  expect(lib[2]?.entryId).toBe("kept_uuid");
});

test("the pinned schema versions: AppSettings v3 (the engineLaunch section), UserSettings v4 (background-library entryId row-id)", () => {
  expect(APP_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V3);
  expect(USER_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V4);
});

test("AppSettings v2→v3 lift is a no-op passthrough that stamps the version (engineLaunch is additive)", () => {
  // A v2 row with an existing override (vllmConcurrency) lifts to v3 untouched — the new engineLaunch
  // section is purely additive, so nothing moves; the version stamp stops the lift chain re-running.
  const storedV2 = { vllmConcurrency: { embed: 8 } };
  const lifted = parseAppSettings({ ...storedV2, schemaVersion: SCHEMA_VERSION_V2 });
  expect(lifted.vllmConcurrency).toEqual({ embed: 8 });
  // An absent engineLaunch reads back undefined (the layer resolves it to the env floor downstream).
  expect(lifted.engineLaunch).toBeUndefined();
});
