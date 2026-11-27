// The Appearance carrier manifest and the shapes of the contract built from it: the one home both the client and the
// floor tooling read. The client binds these rows to `AppearanceSettings` and adds the DOM writers; tooling parses the
// live bridge with the schemas here and compares it with the rows here, so neither keeps a second copy.
// Kit carries no DOM and no domain imports: a row names its consumer by file and symbol, never by import.
// The historical rows' selectors stay with the client, which owns which rendered subjects carry its law; only their
// ids and shape live here.

import { z } from "zod";
import { ID_PREFIX, typeIdSchema } from "#ids";

export const APPEARANCE_EDITOR_OWNERS = ["accessibility", "sizing", "effects", "background", "reading", "avatars", "message-style", "message-details"] as const;
export type AppearanceEditorOwner = (typeof APPEARANCE_EDITOR_OWNERS)[number];

export const APPEARANCE_CARRIER_PLANES = ["root-html", "theme-scope", "shell-grid", "background-layer", "message-props", "source-catalog"] as const;
export type AppearanceCarrierPlane = (typeof APPEARANCE_CARRIER_PLANES)[number];

const APPEARANCE_LIFECYCLES = ["prepaint-and-hydrated", "hydrated", "hydrated-from-prepaint-hint"] as const;
export type AppearanceLifecycle = (typeof APPEARANCE_LIFECYCLES)[number];

const APPEARANCE_PORTAL_OBLIGATIONS = [
  "must-reach-portals",
  "shared-theme-scope-sibling",
  "grid-only",
  "outside-theme-scope",
  "prop-threaded",
  "none",
] as const;
export type AppearancePortalObligation = (typeof APPEARANCE_PORTAL_OBLIGATIONS)[number];

/** The unit a consumer multiplies a numeric setting by; the property itself is a registered `<number>`, since a
 *  registered `em` length would resolve at the root instead of at the element that reads it. */
const APPEARANCE_PROPERTY_UNITS = ["", "em"] as const;
type AppearancePropertyUnit = (typeof APPEARANCE_PROPERTY_UNITS)[number];

/** The OS media condition a `system | on | off` preference follows; its generated variant resolves the three in CSS. */
const APPEARANCE_PREFERENCE_CONDITIONS = ["motion-reduce", "contrast-more"] as const;
export type AppearancePreferenceCondition = (typeof APPEARANCE_PREFERENCE_CONDITIONS)[number];

const THEME_OBSERVABLE_READS = ["attribute", "computed-style", "text-content"] as const;
/** How a theme observable's signals are read off its element: an attribute, the computed style (a custom
 *  property or a CSS property, inherited or inline), or the element's text. */
export type ThemeObservableRead = (typeof THEME_OBSERVABLE_READS)[number];

export const APPEARANCE_HISTORICAL_ROW_IDS = [
  "compact-portal-carried",
  "dark-name-time-short-bubble",
  "light-art-scrim-glass-elevation",
  "mobile-compact-large-document",
  "hover-pointer",
  "density-preview",
  "opposite-os-app-prepaint",
] as const;

const APPEARANCE_CASCADE_SOURCES = ["client-global", "generated-theme", "inline", "owner-custom-css", "shell", "ui-global", "ui-tier"] as const;
export type AppearanceExpectedCascadeSource = (typeof APPEARANCE_CASCADE_SOURCES)[number];

// ---- Shapes ----

const stringList = z.array(z.string()).readonly();
const count = z.number().int().nonnegative();

const observableTarget = { selector: z.string(), signal: z.string() };

/** The browser-readable outcome of one two-arm row: where to look and what to read there. */
const appearanceCarrierObservableSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("attribute"), ...observableTarget }),
  z.strictObject({ kind: z.literal("inline-style"), ...observableTarget }),
  z.strictObject({ kind: z.literal("message-prop"), ...observableTarget }),
]);
export type AppearanceCarrierObservable = z.infer<typeof appearanceCarrierObservableSchema>;

export const appearanceMatrixContractRowSchema = z.strictObject({
  key: z.string(),
  owner: z.enum(APPEARANCE_EDITOR_OWNERS),
  carriers: z.array(z.enum(APPEARANCE_CARRIER_PLANES)).readonly(),
  consumer: z.strictObject({ file: z.string(), symbol: z.string() }),
  lifecycle: z.enum(APPEARANCE_LIFECYCLES),
  portal: z.enum(APPEARANCE_PORTAL_OBLIGATIONS),
  arms: z.array(z.unknown()).readonly().nullable(),
  dependsOn: stringList,
  incompatibleWith: stringList,
  observable: appearanceCarrierObservableSchema.nullable(),
});
export type AppearanceMatrixContractRow = z.infer<typeof appearanceMatrixContractRowSchema>;

const appearanceHistoricalSubjectSchema = z.strictObject({
  id: z.string(),
  selector: z.string(),
  population: z.enum(["one", "many"]),
  sample: z.enum(["carrier", "geometry", "interactive", "pixel"]),
});

const appearanceHistoricalCascadeSchema = z.strictObject({
  selector: z.string(),
  property: z.string(),
  sources: z.array(z.enum(APPEARANCE_CASCADE_SOURCES)).readonly(),
  overloadedSources: z.array(z.enum(APPEARANCE_CASCADE_SOURCES)).readonly().optional(),
});
export type AppearanceHistoricalCascade = z.infer<typeof appearanceHistoricalCascadeSchema>;

const appearanceHistoricalMergeSchema = z.discriminatedUnion("mechanism", [
  z.strictObject({
    mechanism: z.literal("merge-required"),
    selector: z.string(),
    owner: z.string(),
    conflict: z.strictObject({ axis: z.string(), loser: z.string(), winner: z.string() }),
  }),
  z.strictObject({ mechanism: z.literal("merge-not-applicable"), reason: z.literal("direct-carrier"), selector: z.string(), owner: z.string() }),
]);

const appearanceHistoricalRowSchema = z.strictObject({
  id: z.enum(APPEARANCE_HISTORICAL_ROW_IDS),
  surface: z.enum(["chat", "config-sizing", "shell"]),
  subjects: z.array(appearanceHistoricalSubjectSchema).readonly(),
  cascade: z.array(appearanceHistoricalCascadeSchema).readonly(),
  merge: appearanceHistoricalMergeSchema,
  requiredChecks: stringList,
  optionalSubjectIds: stringList,
});
export type AppearanceHistoricalRow = z.infer<typeof appearanceHistoricalRowSchema>;

export const appearanceThemeObservableSchema = z.strictObject({
  selector: z.string(),
  read: z.enum(THEME_OBSERVABLE_READS),
  signals: stringList,
  lifecycle: z.enum(APPEARANCE_LIFECYCLES),
});

export const appearanceMatrixContractSchema = z.strictObject({
  declared: count,
  executable: count,
  dependencies: count,
  rows: z.array(appearanceMatrixContractRowSchema).readonly(),
  themeObservables: z.record(z.string(), appearanceThemeObservableSchema),
  historicalRows: z.array(appearanceHistoricalRowSchema).readonly(),
});
export type AppearanceMatrixContract = z.infer<typeof appearanceMatrixContractSchema>;

/** What the live bridge reports of the message rows it mounted against the ones the registry holds. */
export const appearanceMessageRegistryReceiptSchema = z.strictObject({
  mounted: count,
  registered: count,
  matched: count,
  missingIds: z.array(typeIdSchema(ID_PREFIX.message)).readonly(),
  staleIds: z.array(typeIdSchema(ID_PREFIX.message)).readonly(),
});
export type AppearanceMessageRegistryReceipt = z.infer<typeof appearanceMessageRegistryReceiptSchema>;

// ---- The manifest ----

export interface AppearanceConsumerBinding {
  readonly file: string;
  readonly symbol: string;
}

/**
 * How a setting reaches CSS on the root. `property` is a registered `--appearance-<key>` custom property and
 * `attribute` an always-present `data-appearance-<key>` attribute with one generated variant per value
 * (`packages/client/appearance-channel.build.ts`); `none` keeps the value on another plane: a prop, the theme scope, the grid
 * or the background layer.
 */
export type AppearanceChannel =
  | { readonly kind: "property"; readonly unit: AppearancePropertyUnit }
  | { readonly kind: "attribute"; readonly preference?: AppearancePreferenceCondition }
  | { readonly kind: "none" };

/** The loosest row the manifest may hold; the client narrows each row to its setting's own type. */
interface AppearanceManifestRowShape {
  readonly owner: AppearanceEditorOwner;
  readonly carriers: readonly AppearanceCarrierPlane[];
  readonly channel: AppearanceChannel;
  readonly consumer: AppearanceConsumerBinding;
  readonly lifecycle: AppearanceLifecycle;
  readonly portal: AppearancePortalObligation;
  readonly requiredDistinctArms?: readonly [unknown, unknown];
  readonly dependsOn?: readonly string[];
  readonly incompatibleWith?: readonly string[];
}

const APP_SHELL = { file: "packages/client/src/features/app-shell/surfaces/app-shell.tsx", symbol: "AppShell" } as const;
const BACKGROUND_SOURCE = { file: "packages/client/src/features/app-shell/lib/resolve-theme-background.ts", symbol: "appearanceBackgroundSource" } as const;
const BACKGROUND_EDITOR = { file: "packages/client/src/features/app-shell/components/appearance-background-section.tsx", symbol: "BackgroundBody" } as const;
const MESSAGE_APPEARANCE = { file: "packages/client/src/features/chat/hooks/use-message-appearance.ts", symbol: "useMessageAppearance" } as const;
const CHAT_STYLE = { file: "packages/client/src/features/chat/hooks/use-chat-style.ts", symbol: "useChatStyle" } as const;

export const APPEARANCE_OWNER_KEYS = {
  accessibility: ["reducedMotion", "increasedContrast", "followSystemTransparency"],
  sizing: ["chatWidthPct", "fontScale", "density", "elevation"],
  effects: ["blurSurfaces", "surfaceTexture", "enableThemeColorization"],
  background: [
    "backgroundImageKind",
    "backgroundAssetId",
    "backgroundAssetHash",
    "backgroundAssetMime",
    "backgroundLibrary",
    "backgroundFit",
    "backgroundBlur",
  ],
  reading: ["readingLineHeight", "readingLetterSpacing", "readingBodyScale", "justifyBodyText"],
  avatars: ["showInChatAvatars", "avatarSize", "avatarShape", "avatarAspect", "avatarRing"],
  "message-style": ["chatStyle", "colorQuotedSpeech", "autoFixMarkdown"],
  "message-details": [
    "showTimestamps",
    "showMessageId",
    "showModelIcon",
    "showTokenCount",
    "showGenerationTimer",
    "showGenerationCost",
    "showLLMReasoningIcon",
    "messageActions",
  ],
} as const satisfies Record<AppearanceEditorOwner, readonly string[]>;

const NONE = { kind: "none" } as const;
const ATTRIBUTE = { kind: "attribute" } as const;
const NUMBER = { kind: "property", unit: "" } as const;
const ROOT = { carriers: ["root-html"], lifecycle: "hydrated", portal: "must-reach-portals", consumer: APP_SHELL } as const;
const ROOT_ATTRIBUTE = { ...ROOT, channel: ATTRIBUTE } as const;
const ROOT_NUMBER = { ...ROOT, channel: NUMBER } as const;
// The boot replay writes the two OS preferences before React mounts, so the boot veil and the first shell frame honour them.
const PREFERENCE = { lifecycle: "prepaint-and-hydrated", requiredDistinctArms: ["system", "on"] } as const;
const GRID = { carriers: ["shell-grid"], lifecycle: "hydrated", portal: "grid-only", consumer: APP_SHELL, channel: NONE } as const;
const BACKGROUND = { carriers: ["background-layer"], lifecycle: "hydrated", portal: "outside-theme-scope", consumer: APP_SHELL, channel: NONE } as const;
const MESSAGE = { carriers: ["message-props"], lifecycle: "hydrated", portal: "prop-threaded", consumer: MESSAGE_APPEARANCE, channel: NONE } as const;
const CHAT_WIDTH_NARROW = 60;
const CHAT_WIDTH_WIDE = 90;
const FONT_SCALE_DEFAULT = 1;
const FONT_SCALE_LARGE = 1.25;
const BACKGROUND_BLUR_NONE = 0;
const BACKGROUND_BLUR_VISIBLE = 12;
const READING_LINE_HEIGHT_TIGHT = 1.2;
const READING_LINE_HEIGHT_LOOSE = 2.2;
const READING_LETTER_SPACING_TIGHT = -0.02;
const READING_LETTER_SPACING_LOOSE = 0.08;
const READING_SCALE_SMALL = 0.8;
const READING_SCALE_LARGE = 1.6;
const CHAT_WIDTH_ARMS = [CHAT_WIDTH_NARROW, CHAT_WIDTH_WIDE] as const;
const FONT_SCALE_ARMS = [FONT_SCALE_DEFAULT, FONT_SCALE_LARGE] as const;
const BACKGROUND_BLUR_ARMS = [BACKGROUND_BLUR_NONE, BACKGROUND_BLUR_VISIBLE] as const;
const READING_LINE_HEIGHT_ARMS = [READING_LINE_HEIGHT_TIGHT, READING_LINE_HEIGHT_LOOSE] as const;
const READING_LETTER_SPACING_ARMS = [READING_LETTER_SPACING_TIGHT, READING_LETTER_SPACING_LOOSE] as const;
const READING_SCALE_ARMS = [READING_SCALE_SMALL, READING_SCALE_LARGE] as const;

/** The per-key contract: where each setting is carried, what it owes portals, and the two values a matrix cell applies.
 *  The client binds this map to its settings schema (`packages/client/src/lib/appearance-carrier-manifest.ts`), so a
 *  missing or stale key, an owner that does not list its key, and a carrier/portal mismatch are type errors there. */
export const APPEARANCE_CARRIER_MANIFEST = {
  chatWidthPct: { owner: "sizing", ...ROOT_NUMBER, requiredDistinctArms: CHAT_WIDTH_ARMS },
  fontScale: { owner: "sizing", ...ROOT_NUMBER, lifecycle: "prepaint-and-hydrated", requiredDistinctArms: FONT_SCALE_ARMS },
  density: {
    owner: "sizing",
    carriers: ["theme-scope"],
    channel: NONE,
    consumer: APP_SHELL,
    lifecycle: "hydrated-from-prepaint-hint",
    portal: "shared-theme-scope-sibling",
    requiredDistinctArms: ["comfortable", "compact"],
  },
  elevation: { owner: "sizing", ...GRID, requiredDistinctArms: ["flat", "ramp"] },
  reducedMotion: { owner: "accessibility", ...ROOT, channel: { kind: "attribute", preference: "motion-reduce" }, ...PREFERENCE },
  increasedContrast: { owner: "accessibility", ...ROOT, channel: { kind: "attribute", preference: "contrast-more" }, ...PREFERENCE },
  followSystemTransparency: { owner: "accessibility", ...ROOT_ATTRIBUTE, requiredDistinctArms: [false, true] },

  blurSurfaces: { owner: "effects", ...ROOT_ATTRIBUTE, requiredDistinctArms: [[], ["panels"]] },
  surfaceTexture: { owner: "effects", ...ROOT_ATTRIBUTE, requiredDistinctArms: ["none", "grain"] },
  enableThemeColorization: { owner: "effects", ...ROOT_ATTRIBUTE, requiredDistinctArms: [false, true] },

  // The painted arm is `asset` since `seeded` retired (2026-09-18). `seeded` was the only NON-none kind a
  // tool could complete from a static source, so the matrix's second arm now needs a LIVE background —
  // supplied by `appearancePatchForAssignment`'s background capability, which the ten per-user seeded scene
  // plates guarantee is non-empty. `external` is not a candidate: it is input-only and never paints.
  backgroundImageKind: { owner: "background", ...BACKGROUND, consumer: BACKGROUND_SOURCE, requiredDistinctArms: ["none", "asset"] },
  backgroundAssetId: { owner: "background", ...BACKGROUND, consumer: BACKGROUND_SOURCE, dependsOn: ["backgroundImageKind"] },
  backgroundAssetHash: { owner: "background", ...BACKGROUND, consumer: BACKGROUND_SOURCE, dependsOn: ["backgroundImageKind"] },
  backgroundAssetMime: { owner: "background", ...BACKGROUND, consumer: BACKGROUND_SOURCE, dependsOn: ["backgroundImageKind"] },
  backgroundLibrary: {
    owner: "background",
    carriers: ["source-catalog"],
    channel: NONE,
    consumer: BACKGROUND_EDITOR,
    lifecycle: "hydrated",
    portal: "none",
    dependsOn: ["backgroundImageKind", "backgroundAssetId", "backgroundAssetHash", "backgroundAssetMime"],
  },
  backgroundFit: { owner: "background", ...BACKGROUND, requiredDistinctArms: ["cover", "contain"], dependsOn: ["backgroundImageKind"] },
  backgroundBlur: { owner: "background", ...BACKGROUND, requiredDistinctArms: BACKGROUND_BLUR_ARMS, dependsOn: ["backgroundImageKind"] },

  readingLineHeight: { owner: "reading", ...ROOT_NUMBER, requiredDistinctArms: READING_LINE_HEIGHT_ARMS },
  readingLetterSpacing: { owner: "reading", ...ROOT, channel: { kind: "property", unit: "em" }, requiredDistinctArms: READING_LETTER_SPACING_ARMS },
  readingBodyScale: { owner: "reading", ...ROOT_NUMBER, requiredDistinctArms: READING_SCALE_ARMS },
  justifyBodyText: { owner: "reading", ...ROOT_ATTRIBUTE, requiredDistinctArms: [false, true] },

  showInChatAvatars: { owner: "avatars", ...MESSAGE, requiredDistinctArms: [false, true] },
  avatarSize: { owner: "avatars", ...MESSAGE, requiredDistinctArms: ["sm", "lg"] },
  avatarShape: { owner: "avatars", ...MESSAGE, requiredDistinctArms: ["round", "square"] },
  avatarAspect: { owner: "avatars", ...MESSAGE, requiredDistinctArms: ["square", "portrait"] },
  avatarRing: { owner: "avatars", ...MESSAGE, requiredDistinctArms: ["none", "accent"] },

  chatStyle: { owner: "message-style", ...MESSAGE, consumer: CHAT_STYLE, requiredDistinctArms: ["bubble", "document"] },
  colorQuotedSpeech: { owner: "message-style", ...MESSAGE, requiredDistinctArms: [false, true] },
  autoFixMarkdown: { owner: "message-style", ...MESSAGE, requiredDistinctArms: [false, true] },

  showTimestamps: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  showMessageId: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  showModelIcon: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  showTokenCount: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  showGenerationTimer: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  showGenerationCost: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  showLLMReasoningIcon: { owner: "message-details", ...MESSAGE, requiredDistinctArms: [false, true] },
  messageActions: { owner: "message-details", ...MESSAGE, requiredDistinctArms: ["hover", "expanded"] },
} as const satisfies Record<string, AppearanceManifestRowShape>;

export type AppearanceCarrierKey = keyof typeof APPEARANCE_CARRIER_MANIFEST;

// ---- Channels ----

/** The settings that reach CSS on the root, each with the one name the writer, the boot replay, the generated CSS and the lint use. */
export interface AppearanceChannelRow {
  readonly key: AppearanceCarrierKey;
  readonly kind: "property" | "attribute";
  readonly name: string;
  readonly unit: AppearancePropertyUnit;
  /** The OS condition a three-way preference follows, or null for a plain value. */
  readonly preference: AppearancePreferenceCondition | null;
}

const APPEARANCE_PROPERTY_PREFIX = "--appearance-";
export const APPEARANCE_ATTRIBUTE_PREFIX = "data-appearance-";

function kebab(key: string): string {
  return key.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

const MANIFEST_KEYS: readonly AppearanceCarrierKey[] = Object.keys(APPEARANCE_CARRIER_MANIFEST).filter(
  (key): key is AppearanceCarrierKey => key in APPEARANCE_CARRIER_MANIFEST,
);

export const APPEARANCE_CHANNEL_ROWS: readonly AppearanceChannelRow[] = MANIFEST_KEYS.flatMap((key): AppearanceChannelRow[] => {
  const channel: AppearanceChannel = APPEARANCE_CARRIER_MANIFEST[key].channel;
  if (channel.kind === "none") {
    return [];
  }
  return channel.kind === "property"
    ? [{ key, kind: "property", name: `${APPEARANCE_PROPERTY_PREFIX}${kebab(key)}`, unit: channel.unit, preference: null }]
    : [{ key, kind: "attribute", name: `${APPEARANCE_ATTRIBUTE_PREFIX}${kebab(key)}`, unit: "", preference: channel.preference ?? null }];
});

export const CHANNEL_BY_KEY: ReadonlyMap<AppearanceCarrierKey, AppearanceChannelRow> = new Map(APPEARANCE_CHANNEL_ROWS.map((row) => [row.key, row]));

/** The channel name a root-carried key writes; the call site names a key whose row declares a channel. */
export function appearanceChannelName(key: AppearanceCarrierKey): string {
  const row = CHANNEL_BY_KEY.get(key);
  if (row === undefined) {
    throw new Error(`appearance.${key} declares no CSS channel`);
  }
  return row.name;
}

// ---- Observables ----

function rootObservable(key: AppearanceCarrierKey): AppearanceCarrierObservable {
  const name = appearanceChannelName(key);
  return CHANNEL_BY_KEY.get(key)?.kind === "property"
    ? { kind: "inline-style", selector: "html", signal: name }
    : { kind: "attribute", selector: "html", signal: name };
}

const LIVE_MESSAGE_ROW_SELECTOR = '[data-slot="message-row"]';

/** The browser-readable outcome for every two-arm row. The focused carrier matrix applies both declared
 * values through the real AppShell/message hooks and reads these signals. The client holds this map to the
 * armed rows: an armed row without an observation, or an observation without arms, is a type error there. */
export const APPEARANCE_CARRIER_OBSERVABLES = {
  chatWidthPct: rootObservable("chatWidthPct"),
  fontScale: rootObservable("fontScale"),
  density: { kind: "attribute", selector: '[data-slot="theme-scope"]:has(.shell-grid)', signal: "data-density" },
  elevation: { kind: "attribute", selector: ".shell-grid", signal: "data-elevation" },
  reducedMotion: rootObservable("reducedMotion"),
  increasedContrast: rootObservable("increasedContrast"),
  blurSurfaces: rootObservable("blurSurfaces"),
  surfaceTexture: rootObservable("surfaceTexture"),
  enableThemeColorization: rootObservable("enableThemeColorization"),
  backgroundImageKind: { kind: "attribute", selector: ".shell-grid", signal: "data-has-bg-image" },
  backgroundFit: { kind: "inline-style", selector: '[data-slot="theme-background-layer"]', signal: "background-size" },
  backgroundBlur: { kind: "inline-style", selector: '[data-slot="theme-background-layer"]', signal: "filter" },
  readingLineHeight: rootObservable("readingLineHeight"),
  readingLetterSpacing: rootObservable("readingLetterSpacing"),
  readingBodyScale: rootObservable("readingBodyScale"),
  justifyBodyText: rootObservable("justifyBodyText"),
  followSystemTransparency: rootObservable("followSystemTransparency"),
  showInChatAvatars: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "showInChatAvatars" },
  avatarSize: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "avatarSize" },
  avatarShape: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "avatarShape" },
  avatarAspect: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "avatarAspect" },
  avatarRing: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "avatarRing" },
  chatStyle: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "chatStyle" },
  colorQuotedSpeech: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "colorQuotedSpeech" },
  autoFixMarkdown: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "autoFixMarkdown" },
  showTimestamps: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "metadataVisibility.showTimestamps" },
  showMessageId: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "metadataVisibility.showMessageId" },
  showModelIcon: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "metadataVisibility.showModelIcon" },
  showTokenCount: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "metadataVisibility.showTokenCount" },
  showGenerationTimer: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "metadataVisibility.showGenerationTimer" },
  showGenerationCost: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "metadataVisibility.showGenerationCost" },
  showLLMReasoningIcon: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "showLLMReasoningIcon" },
  messageActions: { kind: "message-prop", selector: LIVE_MESSAGE_ROW_SELECTOR, signal: "messageActions" },
} as const satisfies Partial<Record<AppearanceCarrierKey, AppearanceCarrierObservable>>;

/** Theme selection is adjacent to Appearance but is not one of its schema leaves. These rendered
 * observables are what the rated matrix must read after applying a theme request: an intercepted settings envelope
 * proves neither the palette that painted nor the polarity/custom-CSS planes that won. Nested scopes stay
 * independently observable because room/card overrides intentionally do not flatten into the app scope. */
export const THEME_CARRIER_OBSERVABLES = {
  seedRoot: { selector: "html", read: "attribute", signals: ["data-theme"], lifecycle: "prepaint-and-hydrated" },
  activeScope: {
    selector: '[data-slot="theme-scope"]:has(.shell-grid)',
    read: "computed-style",
    signals: ["--color-background", "color-scheme"],
    lifecycle: "hydrated",
  },
  portalRoot: { selector: '[data-slot="portal-root"]', read: "computed-style", signals: ["--color-background", "color-scheme"], lifecycle: "hydrated" },
  carriedScope: {
    selector: '[data-slot="theme-scope"]:has(.shell-grid) [data-slot="theme-scope"]',
    read: "computed-style",
    signals: ["--color-background", "color-scheme"],
    lifecycle: "hydrated",
  },
  ownerCustomCss: { selector: "style[data-orb-theme-css]", read: "text-content", signals: ["textContent"], lifecycle: "hydrated" },
} as const satisfies Record<string, z.infer<typeof appearanceThemeObservableSchema>>;

/** The carrier half of the matrix contract, derived from the manifest: every declared key, its two arms and its
 *  observable. The historical rows belong to the client, which joins them in. */
export function appearanceCarrierContract(): Omit<AppearanceMatrixContract, "historicalRows"> {
  const declared: Readonly<Record<AppearanceCarrierKey, AppearanceManifestRowShape>> = APPEARANCE_CARRIER_MANIFEST;
  const observables: Partial<Record<AppearanceCarrierKey, AppearanceCarrierObservable>> = APPEARANCE_CARRIER_OBSERVABLES;
  const rows = MANIFEST_KEYS.map((key): AppearanceMatrixContractRow => {
    const row = declared[key];
    return {
      key,
      owner: row.owner,
      carriers: row.carriers,
      consumer: row.consumer,
      lifecycle: row.lifecycle,
      portal: row.portal,
      arms: row.requiredDistinctArms ?? null,
      dependsOn: row.dependsOn ?? [],
      incompatibleWith: row.incompatibleWith ?? [],
      observable: observables[key] ?? null,
    };
  });
  const executable = rows.filter((row) => row.arms !== null).length;
  return { declared: rows.length, executable, dependencies: rows.length - executable, rows, themeObservables: THEME_CARRIER_OBSERVABLES };
}
