import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES } from "@orb/contracts/imagery";
import type { AppSettings, UserSettings } from "@orb/contracts/settings";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  appSettingsConfig,
  appSettingsSchema,
  DEFAULT_BLUR_SURFACES,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_USER_SETTINGS,
  LOG_LEVELS,
  PROMPT_CACHE_MIN_DEPTH_CEIL,
  parseAppSettings,
  parseUserSettings,
  resolveImageryCaption,
  resolveImageryTemplate,
  STREAM_SCROLL_MODES,
  USER_SETTINGS_SCHEMA_VERSION,
  USER_SETTINGS_SECTIONS,
  userSettingsConfig,
  userSettingsSchema,
} from "@orb/contracts/settings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;
const SCHEMA_VERSION_V4 = 4;
const SCHEMA_VERSION_V5 = 5;
const SCHEMA_VERSION_V6 = 6;
const SCHEMA_VERSION_V7 = 7;
const SCHEMA_VERSION_V8 = 8;
const SCHEMA_VERSION_V9 = 9;
const SAMPLE_SCAN_DEPTH = 12;

// ── D17 owner-box governance toggles (the headline deviation: exist + the right floor defaults) ──

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
    privateEndpointAllowlist: null,
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

// ── Phase B ⑩ admin-tier fields (item 3 databank cap + item 6 quality bounds + additive lift) ──

test("maxDatabankBytes parses a tighten-only override and self-heals out-of-bounds (.catch → undefined)", () => {
  // A value ≤ the 20 MiB route belt is stored; the resolver's `min` then tightens the served cap.
  expect(parseAppSettings({ maxDatabankBytes: 5_000_000 }).maxDatabankBytes).toBe(5_000_000);
  // Above the route belt (an attempt to WIDEN) fails the schema max → drops → the belt governs (fail-safe).
  expect(parseAppSettings({ maxDatabankBytes: 999_999_999 }).maxDatabankBytes).toBeUndefined();
  expect(parseAppSettings({ maxDatabankBytes: 1 }).maxDatabankBytes).toBeUndefined(); // below the floor
});

test("imageVariantQuality parses a valid 1–100 override and self-heals out-of-bounds", () => {
  expect(parseAppSettings({ imageVariantQuality: 60 }).imageVariantQuality).toBe(60);
  expect(parseAppSettings({ imageVariantQuality: 0 }).imageVariantQuality).toBeUndefined();
  expect(parseAppSettings({ imageVariantQuality: 101 }).imageVariantQuality).toBeUndefined();
  expect(parseAppSettings({ imageVariantQuality: 60.5 }).imageVariantQuality).toBeUndefined(); // non-int
});

test("v3→v4 AppSettings lift is a no-op passthrough — the ⑩ admin fields are additive (absent ⇒ the resolver floor)", () => {
  // A v3 blob (no ⑩ fields) lifts to v4 untouched; existing overrides survive, the missing fields stay absent
  // (read back as their floor by the resolver) — the v2→v3 engineLaunch additive precedent. `schemaVersion`
  // is stamped only on WRITE (the schema strips it on parse), so we assert the field survival, not the stamp.
  const liftedV3 = parseAppSettings({ schemaVersion: 3, maxImageBytes: 20_000_000 });
  expect(liftedV3.maxImageBytes).toBe(20_000_000);
  expect(liftedV3.imageVariantQuality).toBeUndefined();
  expect(liftedV3.agentSdkConcurrency).toBeUndefined();
});

test("v4→v5 AppSettings lift is a no-op passthrough — structuredOutputShape is additive (absent ⇒ the resolver floor)", () => {
  // D126. A v4 blob (no shape field) lifts to v5 untouched; the missing field stays absent and reads back as
  // its born-in-DB floor. A garbage value self-heals to absent rather than nuking the blob (`.catch`).
  const liftedV4 = parseAppSettings({ schemaVersion: 4, imageVariantQuality: 60 });
  expect(liftedV4.imageVariantQuality).toBe(60);
  expect(liftedV4.structuredOutputShape).toBeUndefined();
  expect(parseAppSettings({ structuredOutputShape: "strict-compatible" }).structuredOutputShape).toBe("strict-compatible");
  expect(parseAppSettings({ structuredOutputShape: "nonsense", logLevel: "debug" })).toEqual({ logLevel: "debug" });
});

test("v7→v8 AppSettings lift drops memoryDefaults.recencyBias and carries EVERY other key forward (#321)", () => {
  // #321 / PD-35 — the recencyBias knob is REMOVED (owner ruling 2026-08-22, after his own 2026-08-20 probe
  // measured no recall gain on the real corpus). This is the FIRST AppSettings lift that DELETES a field, so
  // it is also the one that has to prove it is not the #461 incident class: a lift that quietly drops sections
  // destroys an admin's overrides permanently. Every sibling section AND every sibling memoryDefaults knob is
  // therefore asserted BY VALUE, not by spot-check.
  //
  // The absence is asserted through `Object.keys` rather than a property read so the pin compiles against the
  // pre-removal shape too (a property read of a deleted key is a build error, which proves nothing).
  const storedV7 = {
    schemaVersion: SCHEMA_VERSION_V7,
    memoryDefaults: {
      recencyBias: 0.5,
      blockSize: 16,
      verbatimWindow: 4,
      queryWindow: 3,
      mode: "mixB",
      fanOut: 6,
      maxTier: 2,
      retrieveK: 12,
      rerankTo: 5,
      minScore: 0.4,
      keywordMatch: false,
    },
    memorySummarizer: { maxTokens: 2048, temperature: 0.7 },
    rateLimits: { aiTurn: 60, login: 10 },
    agentSdkConcurrency: { summarize: 4 },
    logLevel: "debug",
    corpusAutoindex: true,
    forbidExternalMedia: true,
    maxImageBytes: 20_000_000,
    imageVariantQuality: 60,
    structuredOutputShape: "strict-compatible",
    structuredOutputVehicle: "forced-tool",
    promptCacheMinDepth: 4,
    localMultiUser: true,
  };
  const parsed = parseAppSettings(storedV7);

  expect(APP_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V8);
  // The knob is GONE — not merely zeroed, absent from the parsed section.
  expect(Object.keys(parsed.memoryDefaults ?? {})).not.toContain("recencyBias");
  // …and the other TEN memoryDefaults knobs survive byte-identically.
  expect(parsed.memoryDefaults).toEqual({
    blockSize: 16,
    verbatimWindow: 4,
    queryWindow: 3,
    mode: "mixB",
    fanOut: 6,
    maxTier: 2,
    retrieveK: 12,
    rerankTo: 5,
    minScore: 0.4,
    keywordMatch: false,
  });
  // …as does every sibling SECTION (the carry-forward receipt the #461 class demands).
  expect(parsed.memorySummarizer).toEqual({ maxTokens: 2048, temperature: 0.7 });
  expect(parsed.rateLimits).toEqual({ aiTurn: 60, login: 10 });
  expect(parsed.agentSdkConcurrency).toEqual({ summarize: 4 });
  expect(parsed.logLevel).toBe("debug");
  expect(parsed.corpusAutoindex).toBe(true);
  expect(parsed.forbidExternalMedia).toBe(true);
  expect(parsed.maxImageBytes).toBe(20_000_000);
  expect(parsed.imageVariantQuality).toBe(60);
  expect(parsed.structuredOutputShape).toBe("strict-compatible");
  expect(parsed.structuredOutputVehicle).toBe("forced-tool");
  expect(parsed.promptCacheMinDepth).toBe(4);
  expect(parsed.localMultiUser).toBe(true);
});

test("a v8 blob that still carries recencyBias is stripped at parse, section intact (#321)", () => {
  // The lift only runs for blobs stamped BELOW the current version. A blob already stamped v8 that somehow
  // carries the retired key (a stale writer, a hand-edited row) must ALSO lose just that key — the
  // `personaWizardSeen` precedent: zod strips the unknown, the section is not healed away wholesale.
  const parsed = parseAppSettings({
    schemaVersion: SCHEMA_VERSION_V8,
    memoryDefaults: { recencyBias: 0.9, retrieveK: 12 },
  });
  expect(Object.keys(parsed.memoryDefaults ?? {})).not.toContain("recencyBias");
  expect(parsed.memoryDefaults).toEqual({ retrieveK: 12 });
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

// NOTE (test-tree cut-over, @orb/inference program §5.3/§5.3c): the `routing.roleDefaults` section and its
// v1→v2 lift LEFT the user-settings blob at v8→v9 (packages/contracts/src/settings/index.ts) — the four
// tests formerly here (the v1→v2 fold into `routing.roleDefaults.chat`, the storedVersion-beats-in-blob-probe
// pin over a `routing` blob, the per-role inference-source subset pin, and the summarize local-light-reject
// pin) pinned a section that no longer exists and were deleted rather than ported.

// ── groupDefaults carries the D22 memberCardVisibility default 'sheet' ──

test("UserSettings.groupDefaults carries the D22 memberCardVisibility default 'sheet'", () => {
  expect(DEFAULT_USER_SETTINGS.groupDefaults).toEqual(DEFAULT_GROUP_CONFIG);
  expect(DEFAULT_USER_SETTINGS.groupDefaults.memberCardVisibility).toBe("sheet");
});

// RETIRED KEY, one tier up (2026-08-08): `group.groupCharacterId` was deleted from `groupConfigSchema` and
// both union arms are strict, so a stored `groupDefaults` still carrying it would fail the parse and the
// `.catch(DEFAULT_GROUP_CONFIG)` would silently revert the user's saved room defaults to per-speaker — the
// same silent-reversal class as the chat blob, one tier up. `groupDefaults` shares the chat blob's ONE
// stored-read schema (`storedGroupConfigSchema`), so the strip lands here too. The section's WRITE path is
// deep-merge-and-re-validate through this same lenient parser by design
// (`domain/settings/verbs/update-user-settings-section.ts`) — there is no strict door being weakened.
//
// Both pins pass the STORED VERSION, which is what the real read seam does
// (`domain/settings/persistence/queries.ts:32` — `parseUserSettings(row.config, row.schemaVersion)`). Without
// it the blob probes as v1 and the v1 lift rebuilds it from the v1 key set, where `groupDefaults` did not yet
// exist — a correct additive-namespace drop that would mask what these pins are about.
test("a stored groupDefaults carrying the retired groupCharacterId keeps its mode (stripped, not reverted)", () => {
  const parsed = parseUserSettings(
    { groupDefaults: { output: "narrator", policy: "list", speakerTags: false, groupCharacterId: mintTypeId(ID_PREFIX.character) } },
    USER_SETTINGS_SCHEMA_VERSION,
  );
  expect(parsed.groupDefaults.output).toBe("narrator");
  expect(parsed.groupDefaults.policy).toBe("list");
  expect(parsed.groupDefaults.speakerTags).toBe(false);
  expect("groupCharacterId" in parsed.groupDefaults).toBe(false);
});

test("a stray (non-retired) key in groupDefaults still heals the whole section to the default", () => {
  const parsed = parseUserSettings({ groupDefaults: { output: "narrator", policy: "list", cardscope: "scoped" } }, USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.groupDefaults).toEqual(DEFAULT_GROUP_CONFIG);
});

// ── Additive namespaces read their default with NO version bump (the lenient-parser dividend) ──

test("additive namespaces (onboarding/groupDefaults/workloads/profile) read defaults from an empty blob", () => {
  const parsed = parseUserSettings({});
  expect(parsed.onboarding).toEqual(DEFAULT_USER_SETTINGS.onboarding);
  expect(parsed.workloads).toEqual(DEFAULT_USER_SETTINGS.workloads);
  expect(parsed.profile).toEqual(DEFAULT_USER_SETTINGS.profile);
  expect(parsed.groupDefaults).toEqual(DEFAULT_GROUP_CONFIG);
});

test("onboarding: personaWizardSeen was DELETED (⑥); a stored stale value is stripped, sibling seeded-flags survive", () => {
  // The dead field is gone from the shape (the first-run gate triggers on zero personas, not a "seen" flag).
  expect(Object.hasOwn(DEFAULT_USER_SETTINGS.onboarding, "personaWizardSeen")).toBe(false);
  // A stamped blob carrying the retired key parses (zod strips the unknown key) and keeps the consumed
  // sibling flags. `schemaVersion` stamped so no lift rewrites the shape (this pins the current parse, not a lift).
  const parsed = parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, onboarding: { personaWizardSeen: true, defaultPersonaSeeded: true } });
  expect(Object.hasOwn(parsed.onboarding, "personaWizardSeen")).toBe(false);
  expect(parsed.onboarding.defaultPersonaSeeded).toBe(true);
});

test("onboarding: seededPluginVersions round-trips per slug, and a malformed blob degrades to EMPTY not to a lie", () => {
  // #803's divergence oracle. It starts EMPTY, which is also the pre-#803 backfill arm the seeder reads as
  // "adopt whatever this user holds" — so the default is load-bearing, not decoration.
  expect(DEFAULT_USER_SETTINGS.onboarding.seededPluginVersions).toEqual({});

  const parsed = parseUserSettings({
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    onboarding: { examplePluginsSeeded: true, seededPluginVersions: { "card-atlas": "1.1.0", "oracle-deck": "1.0.0" } },
  });
  expect(parsed.onboarding.seededPluginVersions).toEqual({ "card-atlas": "1.1.0", "oracle-deck": "1.0.0" });
  // The latch and the record are INDEPENDENT halves of one seeder: the latch gates installing, the map gates
  // upgrading, and a pass reads both.
  expect(parsed.onboarding.examplePluginsSeeded).toBe(true);

  // A blob whose value is the wrong SHAPE falls to `{}` rather than throwing the whole settings read — and
  // `{}` is the safe arm on purpose: the seeder then treats every held row as adopted and compares versions,
  // which can at worst cost one redundant upgrade pass that finds nothing newer to do.
  const salvaged = parseUserSettings({
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    onboarding: { examplePluginsSeeded: true, seededPluginVersions: ["card-atlas", "1.1.0"] },
  });
  expect(salvaged.onboarding.seededPluginVersions).toEqual({});
  // FIELD-LOCAL salvage is the load-bearing half: without `.catch({})` ON THIS FIELD the malformed value
  // fails the whole `onboarding` object and every SIBLING latch resets to its default — which would
  // resurrect nine uninstalled showcase plugins on the next request. The sibling is the real assertion.
  expect(salvaged.onboarding.examplePluginsSeeded).toBe(true);
});

test("workloads: the analysis-tuning knobs are section-patchable (⑤) — maxPairs/hubFraction accepted", () => {
  const parsed = parseUserSettings({
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    workloads: { dupThreshold: 0.8, computeThemesK: 20, maxPairs: 5000, hubFraction: 0.3 },
  });
  expect(parsed.workloads).toEqual({ dupThreshold: 0.8, computeThemesK: 20, maxPairs: 5000, hubFraction: 0.3 });
});

// ── persona (FINAL-Persona §A.6b) — the additive persona-UX namespace ──

test("UserSettings.persona.showNotifications defaults true from an empty blob (no version bump)", () => {
  const parsed = parseUserSettings({});
  expect(parsed.persona.showNotifications).toBe(true);
  expect(DEFAULT_USER_SETTINGS.persona.showNotifications).toBe(true);
});

test("USER_SETTINGS_SECTIONS includes databank (section-patchable — the DB6 retrieval-tuning write path)", () => {
  expect(USER_SETTINGS_SECTIONS).toContain("databank");
});

test("USER_SETTINGS_SECTIONS includes persona (section-patchable via updateUserSettingsSection)", () => {
  expect(USER_SETTINGS_SECTIONS).toContain("persona");
});

test("USER_SETTINGS_SECTIONS includes prose — the PROSE-1 S2 editor's door, landed WITH its writer (D107 arm B)", () => {
  expect(USER_SETTINGS_SECTIONS).toContain("prose");
  // A section-patch merges per key, and a prose key is a slot id: a patched slot must not disturb a sibling.
  const merged = parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, prose: { "chat.arbiter.system": { text: "mine", baseVersion: 1 } } });
  expect(merged.prose["chat.arbiter.system"]).toEqual({ text: "mine", baseVersion: 1 });
  expect(merged.prose["chat.compaction.system"]).toBeUndefined();
});

// ── chat (PD-146) — the client-honored send/continue/stream behavior namespace ──

test("UserSettings.chat reads the PD-146 defaults from an empty blob (Enter sends, smooth-stream ON)", () => {
  const parsed = parseUserSettings({});
  expect(parsed.chat.enterSends).toBe(true);
  expect(parsed.chat.continueOnSend).toBe(true);
  expect(parsed.chat.autoContinue).toBe(false);
  // Owner ruling 2026-08-09 (#42 forge): the fade rides `mode="streaming"` in BOTH modes, so this knob is
  // pure pacing and ships ON. The flip is the whole point of the row — pin the VALUE, not the schema shape.
  expect(parsed.chat.smoothStream).toBe(true);
  expect(parsed.chat.smoothStreamCps).toBe(80);
  expect(DEFAULT_USER_SETTINGS.chat.enterSends).toBe(true);
  expect(DEFAULT_USER_SETTINGS.chat.smoothStream).toBe(true);
});

test("UserSettings.chat.smoothStream keeps an explicit OFF (the .catch(true) heal never overrides a real false)", () => {
  // The knob is still a knob: a user who turned pacing off must not be re-defaulted ON by the flip. `false`
  // is a valid boolean, so `.catch` never fires; only a NON-boolean heals to the new default.
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { smoothStream: false } }).chat.smoothStream).toBe(false);
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { smoothStream: "yes" } }).chat.smoothStream).toBe(true);
});

test("UserSettings.chat.smoothStreamCps self-heals an out-of-bounds value to the default (.catch)", () => {
  // Stamp the current version so the v1 lift (which rebuilds the chat namespace) doesn't run.
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { smoothStreamCps: 9999 } }).chat.smoothStreamCps).toBe(80);
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { smoothStreamCps: 150 } }).chat.smoothStreamCps).toBe(150);
});

test("UserSettings.chat.reasoningAutoCollapse defaults ON (today's behavior) and keeps an explicit OFF", () => {
  // Default ON = the live reasoning disclosure folds on the first answer token, as it always has.
  expect(parseUserSettings({}).chat.reasoningAutoCollapse).toBe(true);
  expect(DEFAULT_USER_SETTINGS.chat.reasoningAutoCollapse).toBe(true);
  // A user who turns it off (keep the trace open) must not be re-defaulted ON; only a non-boolean heals.
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { reasoningAutoCollapse: false } }).chat.reasoningAutoCollapse).toBe(false);
  expect(parseUserSettings({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION, chat: { reasoningAutoCollapse: "nope" } }).chat.reasoningAutoCollapse).toBe(true);
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
  // Metadata visibility (timestamps + in-chat avatars ON; the rest OFF)
  expect(parsed.appearance.showTimestamps).toBe(true);
  expect(parsed.appearance.showInChatAvatars).toBe(true);
  expect(parsed.appearance.showTokenCount).toBe(false);
  expect(parsed.appearance.messageActions).toBe("hover");
  // Blur ships ON for the three chrome surfaces (owner ruling 2026-08-02); `messages` stays out —
  // the Reading-Surface rule forbids blur behind long reading text by default. Shadow/motion stay OFF.
  expect(parsed.appearance.blurSurfaces).toEqual([...DEFAULT_BLUR_SURFACES]);
  expect(parsed.appearance.blurSurfaces).not.toContain("messages");
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
        avatarSize: "enormous", // not sm/md/lg → catch → "md"
        avatarAspect: "landscape", // not square/portrait → catch → "square"
        chatWidthPct: 5000, // over the max → catch → 60
        fontScale: 99, // over the max → catch → 1
        showTimestamps: "yes", // not a boolean → catch → true (the default)
        density: "roomy", // not a THEME_DENSITIES member → catch → "comfortable"
        blurSurfaces: ["fog"], // not a BLUR_SURFACES member → catch → the shipped default set
      },
    },
    USER_SETTINGS_SCHEMA_VERSION,
  );
  expect(parsed.appearance.chatStyle).toBe("bubble");
  expect(parsed.appearance.avatarSize).toBe("md");
  expect(parsed.appearance.avatarAspect).toBe("square");
  expect(parsed.appearance.chatWidthPct).toBe(60);
  expect(parsed.appearance.fontScale).toBe(1);
  expect(parsed.appearance.showTimestamps).toBe(true);
  expect(parsed.appearance.density).toBe("comfortable");
  expect(parsed.appearance.blurSurfaces).toEqual([...DEFAULT_BLUR_SURFACES]);
});

// An explicitly-stored OPT-OUT must survive the new ON-by-default: `[]` is a legal parse, not a
// missing-field that re-defaults (the risk of moving a default off the empty value).
test("UserSettings.appearance: an explicit empty blurSurfaces is kept, not re-defaulted", () => {
  const parsed = parseUserSettings({ appearance: { blurSurfaces: [] } }, USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.appearance.blurSurfaces).toEqual([]);
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

test("USER_SETTINGS_SECTIONS excludes schemaVersion and no longer carries the retired regex section", () => {
  // D121-E DELETED the `regex` section: the owner's script library is `regex_scripts` rows behind the
  // `regex` tRPC router, so there is no addressable settings namespace for it any more — and the pre-v3
  // top-level `regexScripts` array is long gone too.
  expect(USER_SETTINGS_SECTIONS).not.toContain("regex");
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
  };
  // A stored v2 row (column = 2) with the OLD top-level array + a sibling namespace to prove it survives.
  const storedV2 = { regexScripts: [script], worldInfo: { scanDepth: SAMPLE_SCAN_DEPTH } };
  const parsed = parseUserSettings(storedV2, SCHEMA_VERSION_V2);
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

test("v4→(v5→v6→v7) lift is a no-op passthrough — databank + imagery + prose sections are additive, absent ⇒ grounded defaults", () => {
  // A v4 row (no databank/imagery keys) lifts through the chain to the current version untouched; the missing
  // sections read back as their prefault defaults (byte-identical — the additive-section precedent). Others survive.
  const storedV4 = { worldInfo: { scanDepth: 12 } };
  const lifted = parseUserSettings(storedV4, SCHEMA_VERSION_V4);
  expect(lifted.schemaVersion).toBe(SCHEMA_VERSION_V9);
  expect(lifted.worldInfo.scanDepth).toBe(12); // an existing override survives the lift
  expect(lifted.databank.retrieval).toEqual({ k: 5, minScore: 0.25, rerank: false });
  expect(lifted.databank.slotTokenBudget).toBe(4096);
  // v5→v6 imagery additive: every per-mode override absent ⇒ the section reads back empty (⇒ shipped defaults).
  expect(lifted.imagery).toEqual({ templates: {}, captions: {} });
  // v6→v7 prose additive (PROSE-1 S1): no slot override ⇒ every app-tier prompt is its shipped default.
  expect(lifted.prose).toEqual({});
});

test("v5→v6 lift adds the imagery section — a v5 blob with no imagery key reads back the empty override set", () => {
  const storedV5 = { chat: { enterSends: false } };
  const lifted = parseUserSettings(storedV5, SCHEMA_VERSION_V5);
  expect(lifted.schemaVersion).toBe(SCHEMA_VERSION_V9);
  expect(lifted.chat.enterSends).toBe(false); // an existing override survives
  expect(lifted.imagery).toEqual({ templates: {}, captions: {} });
});

test("v6→v7 lift adds the prose section — a v6 blob with no prose key reads back the empty override set", () => {
  const storedV6 = { imagery: { templates: { character: "mine" } } };
  const lifted = parseUserSettings(storedV6, SCHEMA_VERSION_V6);
  expect(lifted.schemaVersion).toBe(SCHEMA_VERSION_V9);
  expect(lifted.imagery.templates.character).toBe("mine"); // an existing override survives
  expect(lifted.prose).toEqual({});
});

test("a stored prose override round-trips, and a RETIRED slot id is stripped instead of nuking the section", () => {
  const parsed = parseUserSettings({
    schemaVersion: SCHEMA_VERSION_V7,
    prose: {
      "chat.compaction.system": { text: "Summarize like a ship's log.", baseVersion: 1 },
      // A slot id from a retired feature (§4.4 rung 5) — an enum-keyed record would REJECT it.
      "chat.retired.slot": { text: "gone", baseVersion: 1 },
    },
  });
  expect(parsed.prose).toEqual({ "chat.compaction.system": { text: "Summarize like a ship's log.", baseVersion: 1 } });
});

test("the pinned schema versions: AppSettings v8 (memoryDefaults.recencyBias REMOVED, #321), UserSettings v8 (the regex section's DELETION, D121-E)", () => {
  expect(APP_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V8);
  expect(USER_SETTINGS_SCHEMA_VERSION).toBe(SCHEMA_VERSION_V9);
});

// The AppSettings v6→v7 lift. `structuredOutputVehicle` is purely additive AND its floor (`auto`) resolves
// to exactly the vehicle every request used before the knob existed, so a stored v6 blob must read back with
// the field absent and every sibling override intact — the proof that no deployment's wire bodies moved.
test("AppSettings v6→v7: a stored v6 blob keeps its overrides and reads back with NO structuredOutputVehicle", () => {
  const parsed = parseAppSettings({ schemaVersion: SCHEMA_VERSION_V6, structuredOutputShape: "strict-compatible", promptCacheMinDepth: 2 });
  expect(parsed.structuredOutputShape).toBe("strict-compatible");
  expect(parsed.promptCacheMinDepth).toBe(2);
  expect(parsed.structuredOutputVehicle).toBeUndefined();
  // The two axes COMPOSE — setting the vehicle leaves the shape alone, and a bad value drops to the floor.
  expect(parseAppSettings({ structuredOutputVehicle: "response-format" }).structuredOutputVehicle).toBe("response-format");
  expect(parseAppSettings({ structuredOutputVehicle: "nonsense", logLevel: "debug" })).toEqual({ logLevel: "debug" });
});

// The AppSettings v5→v6 lift. `promptCacheMinDepth` is purely additive AND its floor 0 is the identity of the
// `Math.max` it feeds, so a stored v5 blob must read back with the field absent and every sibling override
// intact — the proof that no deployment's wire bodies moved when this landed.
test("AppSettings v5→v6: a stored v5 blob keeps its overrides and reads back with NO promptCacheMinDepth", () => {
  // `appSettingsSchema` strips the stored `schemaVersion` on the way out (it lives in the blob, not a column),
  // so the lift's receipt is the SURVIVING overrides, not a version field on the parsed value.
  const parsed = parseAppSettings({ schemaVersion: SCHEMA_VERSION_V5, structuredOutputShape: "strict-compatible", maxImageBytes: 1_000_000 });
  expect(parsed.structuredOutputShape).toBe("strict-compatible");
  expect(parsed.maxImageBytes).toBe(1_000_000);
  expect(parsed.promptCacheMinDepth).toBeUndefined();
});

// Bounded at PARSE, the `maxDatabankBytes` precedent: an out-of-range depth drops to the floor rather than
// pushing a breakpoint past Anthropic's ~20-block lookback (or below its own identity).
test("promptCacheMinDepth is bounded 0–20 at parse; an out-of-range or fractional value drops to the floor", () => {
  expect(parseAppSettings({ promptCacheMinDepth: 2 }).promptCacheMinDepth).toBe(2);
  expect(parseAppSettings({ promptCacheMinDepth: PROMPT_CACHE_MIN_DEPTH_CEIL }).promptCacheMinDepth).toBe(PROMPT_CACHE_MIN_DEPTH_CEIL);
  expect(parseAppSettings({ promptCacheMinDepth: PROMPT_CACHE_MIN_DEPTH_CEIL + 1 }).promptCacheMinDepth).toBeUndefined();
  expect(parseAppSettings({ promptCacheMinDepth: -1 }).promptCacheMinDepth).toBeUndefined();
  expect(parseAppSettings({ promptCacheMinDepth: 2.5 }).promptCacheMinDepth).toBeUndefined();
  // The CLEAR sentinel survives as null (the layer reads it as "no override" → the floor).
  expect(parseAppSettings({ promptCacheMinDepth: null }).promptCacheMinDepth).toBeNull();
});

// ── ⑫ imagery templates: default-identity + per-mode override resolution ──

test("resolveImageryTemplate/Caption: a virgin UserSettings resolves EVERY mode to the shipped catalog (byte-identical)", () => {
  const imagery = DEFAULT_USER_SETTINGS.imagery;
  // The default-identity discipline: unset ⇒ the shipped default, character-for-character.
  for (const mode of ["character", "face", "scenario", "background"] as const) {
    expect(resolveImageryTemplate(imagery, mode)).toBe(DEFAULT_PROMPT_TEMPLATES[mode]);
  }
  for (const mode of ["character_multimodal", "face_multimodal"] as const) {
    expect(resolveImageryCaption(imagery, mode)).toBe(DEFAULT_CAPTION_INSTRUCTIONS[mode]);
  }
});

test("resolveImageryTemplate/Caption: a per-mode override wins for THAT mode; the others stay on the default", () => {
  // A CURRENT-version blob (stamped) so no legacy lift runs — the lift chain from an unstamped v1 blob is a
  // full rebuild that only carries the old-shape keys (imagery didn't exist then). A live write is always stamped.
  // biome-ignore lint/style/useNamingConvention: the caption key IS the snake_case PROMPT_TEMPLATE_MODES literal.
  const captions = { face_multimodal: "my caption" };
  const parsed = parseUserSettings({
    schemaVersion: SCHEMA_VERSION_V6,
    imagery: { templates: { character: "my custom {{char}} prompt" }, captions },
  });
  expect(resolveImageryTemplate(parsed.imagery, "character")).toBe("my custom {{char}} prompt");
  expect(resolveImageryTemplate(parsed.imagery, "face")).toBe(DEFAULT_PROMPT_TEMPLATES.face); // untouched mode → default
  expect(resolveImageryCaption(parsed.imagery, "face_multimodal")).toBe("my caption");
  expect(resolveImageryCaption(parsed.imagery, "character_multimodal")).toBe(DEFAULT_CAPTION_INSTRUCTIONS.character_multimodal);
});

test("imagery override self-heals an over-cap value to the default (never nukes the section)", () => {
  const parsed = parseUserSettings({ schemaVersion: SCHEMA_VERSION_V6, imagery: { templates: { character: "x".repeat(4001) } } });
  // The over-cap string trips the field's `.catch(undefined)` → the mode falls back to the shipped default.
  expect(resolveImageryTemplate(parsed.imagery, "character")).toBe(DEFAULT_PROMPT_TEMPLATES.character);
});

// #1364 — the production tenants, not a hand-built config: a blob a NEWER build wrote reports NOT intact,
// so `requireIntactStoredConfig` refuses the read-modify-write instead of persisting the truncation.
test("both settings tiers refuse to call a newer-than-current blob intact (#1364)", () => {
  for (const config of [userSettingsConfig, appSettingsConfig]) {
    const version = config.currentVersion + 3;
    const outcome = config.parseOutcome({ ...structuredClone(config.default), schemaVersion: version, orbFutureField: "newer build" }, version);
    expect(outcome.intact).toBe(false);
    expect(outcome).toMatchObject({ failure: "version-from-future" });
  }
  // The CURRENT version still reads intact — the guard only refuses what it genuinely cannot represent.
  expect(userSettingsConfig.parseOutcome(structuredClone(userSettingsConfig.default), USER_SETTINGS_SCHEMA_VERSION).intact).toBe(true);
});

// NOTE (test-tree cut-over, @orb/inference program): the v2→v3 `engineLaunch`/`vllmConcurrency` no-op-lift
// pin formerly here tested fields the inference cut-over deleted from AppSettings; removed rather than ported.
