// The executable map from every Appearance setting to the DOM/prop plane that carries it (#935).
// Appearance is intentionally multi-plane: root-wide values must reach portals, density belongs on the
// ThemeScope shared by the grid and portal root, background media paints before that scope, and message
// skins stay prop-driven. This manifest describes those boundaries; it is not permission to collapse them.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { APPEARANCE_HISTORICAL_ROWS } from "./appearance-invariant-manifest.ts";

export const APPEARANCE_EDITOR_OWNERS = ["sizing", "effects", "background", "reading", "avatars", "message-style", "message-details"] as const;
export type AppearanceEditorOwner = (typeof APPEARANCE_EDITOR_OWNERS)[number];

export const APPEARANCE_CARRIER_PLANES = ["root-html", "theme-scope", "shell-grid", "background-layer", "message-props", "source-catalog"] as const;
type AppearanceCarrierPlane = (typeof APPEARANCE_CARRIER_PLANES)[number];

const APPEARANCE_LIFECYCLES = ["prepaint-and-hydrated", "hydrated", "hydrated-from-prepaint-hint"] as const;
type AppearanceLifecycle = (typeof APPEARANCE_LIFECYCLES)[number];

const APPEARANCE_PORTAL_OBLIGATIONS = [
  "must-reach-portals",
  "shared-theme-scope-sibling",
  "grid-only",
  "outside-theme-scope",
  "prop-threaded",
  "none",
] as const;
type AppearancePortalObligation = (typeof APPEARANCE_PORTAL_OBLIGATIONS)[number];

interface AppearanceConsumerBinding {
  readonly file: string;
  readonly symbol: string;
}

/** The unit a consumer multiplies a numeric setting by; the property itself is a registered `<number>`, since a
 *  registered `em` length would resolve at the root instead of at the element that reads it. */
const APPEARANCE_PROPERTY_UNITS = ["", "px", "em", "rem"] as const;
type AppearancePropertyUnit = (typeof APPEARANCE_PROPERTY_UNITS)[number];

/**
 * How a setting reaches CSS on the root. `property` is a registered `--appearance-<key>` custom property and
 * `attribute` an always-present `data-appearance-<key>` attribute with one generated variant per value
 * (`appearance-channel.build.ts`); `none` keeps the value on another plane: a prop, the theme scope, the grid
 * or the background layer.
 */
export type AppearanceChannel =
  | { readonly kind: "property"; readonly unit: AppearancePropertyUnit }
  | { readonly kind: "attribute" }
  | { readonly kind: "none" };

/** A number reaches CSS as a property; every other value as an attribute. */
type ChannelFor<V> = Extract<AppearanceChannel, { readonly kind: "none" | (V extends number ? "property" : "attribute") }>;

/** The portal obligation each carrier plane owes. A row's `portal` is the one its FIRST carrier implies. */
const PORTAL_BY_CARRIER = {
  "root-html": "must-reach-portals",
  "theme-scope": "shared-theme-scope-sibling",
  "shell-grid": "grid-only",
  "background-layer": "outside-theme-scope",
  "message-props": "prop-threaded",
  "source-catalog": "none",
} as const satisfies Readonly<Record<AppearanceCarrierPlane, AppearancePortalObligation>>;

/** At least one carrier, and a portal obligation that agrees with the first one. */
type CarrierPortalPairing = {
  readonly [Plane in AppearanceCarrierPlane]: {
    readonly carriers: readonly [Plane, ...AppearanceCarrierPlane[]];
    readonly portal: (typeof PORTAL_BY_CARRIER)[Plane];
  };
}[AppearanceCarrierPlane];

/** The editor owners whose key list names `K`, so a row cannot claim an owner that does not own its key. */
type OwnerOf<K extends keyof AppearanceSettings> = {
  readonly [Owner in AppearanceEditorOwner]: K extends (typeof APPEARANCE_OWNER_KEYS)[Owner][number] ? Owner : never;
}[AppearanceEditorOwner];

type AppearanceCarrierRow<K extends keyof AppearanceSettings> = CarrierPortalPairing & {
  readonly owner: OwnerOf<K>;
  readonly channel: ChannelFor<AppearanceSettings[K]>;
  readonly consumer: AppearanceConsumerBinding;
  readonly lifecycle: AppearanceLifecycle;
  readonly requiredDistinctArms?: readonly [AppearanceSettings[K], AppearanceSettings[K]];
  readonly dependsOn?: readonly (keyof AppearanceSettings)[];
  readonly incompatibleWith?: readonly (keyof AppearanceSettings)[];
};

// `-?` keeps an optional schema leaf required here; the homomorphic map would carry its `?` and let a row go missing.
type AppearanceCarrierManifest = { readonly [K in keyof AppearanceSettings]-?: AppearanceCarrierRow<K> };

const APP_SHELL = { file: "packages/client/src/features/app-shell/surfaces/app-shell.tsx", symbol: "AppShell" } as const;
const BACKGROUND_SOURCE = { file: "packages/client/src/features/app-shell/lib/resolve-theme-background.ts", symbol: "appearanceBackgroundSource" } as const;
const BACKGROUND_EDITOR = { file: "packages/client/src/features/app-shell/components/appearance-background-section.tsx", symbol: "BackgroundBody" } as const;
const MESSAGE_APPEARANCE = { file: "packages/client/src/features/chat/hooks/use-message-appearance.ts", symbol: "useMessageAppearance" } as const;
const CHAT_STYLE = { file: "packages/client/src/features/chat/hooks/use-chat-style.ts", symbol: "useChatStyle" } as const;

export const APPEARANCE_OWNER_KEYS = {
  sizing: ["chatWidthPct", "fontScale", "density", "elevation", "reducedMotion"],
  effects: ["blurSurfaces", "blurStrength", "shadowEffects", "surfaceTexture", "enableThemeColorization"],
  background: [
    "backgroundImageKind",
    "backgroundAssetId",
    "backgroundAssetHash",
    "backgroundAssetMime",
    "backgroundLibrary",
    "backgroundFit",
    "backgroundDim",
    "backgroundBlur",
  ],
  reading: ["readingLineHeight", "readingLetterSpacing", "readingParagraphSpacing", "readingNameScale", "readingBodyScale", "justifyBodyText"],
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
} as const satisfies Record<AppearanceEditorOwner, readonly (keyof AppearanceSettings)[]>;

const NONE = { kind: "none" } as const;
const ATTRIBUTE = { kind: "attribute" } as const;
const NUMBER = { kind: "property", unit: "" } as const;
const ROOT = { carriers: ["root-html"], lifecycle: "hydrated", portal: "must-reach-portals", consumer: APP_SHELL } as const;
const ROOT_ATTRIBUTE = { ...ROOT, channel: ATTRIBUTE } as const;
const ROOT_NUMBER = { ...ROOT, channel: NUMBER } as const;
const GRID = { carriers: ["shell-grid"], lifecycle: "hydrated", portal: "grid-only", consumer: APP_SHELL, channel: NONE } as const;
const BACKGROUND = { carriers: ["background-layer"], lifecycle: "hydrated", portal: "outside-theme-scope", consumer: APP_SHELL, channel: NONE } as const;
const MESSAGE = { carriers: ["message-props"], lifecycle: "hydrated", portal: "prop-threaded", consumer: MESSAGE_APPEARANCE, channel: NONE } as const;
const CHAT_WIDTH_NARROW = 60;
const CHAT_WIDTH_WIDE = 90;
const FONT_SCALE_DEFAULT = 1;
const FONT_SCALE_LARGE = 1.25;
const BLUR_STRENGTH_LOW = 4;
const BLUR_STRENGTH_HIGH = 28;
const BACKGROUND_DIM_LOW = 0.45;
const BACKGROUND_DIM_HIGH = 1;
const BACKGROUND_BLUR_NONE = 0;
const BACKGROUND_BLUR_VISIBLE = 12;
const READING_LINE_HEIGHT_TIGHT = 1.2;
const READING_LINE_HEIGHT_LOOSE = 2.2;
const READING_LETTER_SPACING_TIGHT = -0.02;
const READING_LETTER_SPACING_LOOSE = 0.08;
const READING_PARAGRAPH_SPACING_NONE = 0;
const READING_PARAGRAPH_SPACING_LOOSE = 1.5;
const READING_SCALE_SMALL = 0.8;
const READING_SCALE_LARGE = 1.6;
const CHAT_WIDTH_ARMS = [CHAT_WIDTH_NARROW, CHAT_WIDTH_WIDE] as const;
const FONT_SCALE_ARMS = [FONT_SCALE_DEFAULT, FONT_SCALE_LARGE] as const;
const BLUR_STRENGTH_ARMS = [BLUR_STRENGTH_LOW, BLUR_STRENGTH_HIGH] as const;
const BACKGROUND_DIM_ARMS = [BACKGROUND_DIM_LOW, BACKGROUND_DIM_HIGH] as const;
const BACKGROUND_BLUR_ARMS = [BACKGROUND_BLUR_NONE, BACKGROUND_BLUR_VISIBLE] as const;
const READING_LINE_HEIGHT_ARMS = [READING_LINE_HEIGHT_TIGHT, READING_LINE_HEIGHT_LOOSE] as const;
const READING_LETTER_SPACING_ARMS = [READING_LETTER_SPACING_TIGHT, READING_LETTER_SPACING_LOOSE] as const;
const READING_PARAGRAPH_SPACING_ARMS = [READING_PARAGRAPH_SPACING_NONE, READING_PARAGRAPH_SPACING_LOOSE] as const;
const READING_SCALE_ARMS = [READING_SCALE_SMALL, READING_SCALE_LARGE] as const;

/**
 * The 41-key contract. `satisfies AppearanceCarrierManifest` makes a missing/stale schema key, a row whose
 * owner does not list its key, an empty carrier list, and a carrier/portal mismatch type errors;
 * `tests/client/lib/appearance-carrier-manifest.test.ts` reconciles the same map with the Zod leaves,
 * editor tuples, and named live consumer declarations so a cast cannot hide drift.
 */
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
  reducedMotion: { owner: "sizing", ...ROOT_ATTRIBUTE, lifecycle: "prepaint-and-hydrated", requiredDistinctArms: [false, true] },

  blurSurfaces: { owner: "effects", ...ROOT_ATTRIBUTE, requiredDistinctArms: [[], ["panels"]] },
  blurStrength: {
    owner: "effects",
    ...ROOT,
    channel: { kind: "property", unit: "px" },
    requiredDistinctArms: BLUR_STRENGTH_ARMS,
    dependsOn: ["blurSurfaces"],
  },
  shadowEffects: { owner: "effects", ...ROOT_ATTRIBUTE, requiredDistinctArms: [false, true] },
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
  backgroundDim: { owner: "background", ...BACKGROUND, requiredDistinctArms: BACKGROUND_DIM_ARMS, dependsOn: ["backgroundImageKind"] },
  backgroundBlur: { owner: "background", ...BACKGROUND, requiredDistinctArms: BACKGROUND_BLUR_ARMS, dependsOn: ["backgroundImageKind"] },

  readingLineHeight: { owner: "reading", ...ROOT_NUMBER, requiredDistinctArms: READING_LINE_HEIGHT_ARMS },
  readingLetterSpacing: { owner: "reading", ...ROOT, channel: { kind: "property", unit: "em" }, requiredDistinctArms: READING_LETTER_SPACING_ARMS },
  readingParagraphSpacing: { owner: "reading", ...ROOT, channel: { kind: "property", unit: "rem" }, requiredDistinctArms: READING_PARAGRAPH_SPACING_ARMS },
  readingNameScale: { owner: "reading", ...ROOT_NUMBER, requiredDistinctArms: READING_SCALE_ARMS },
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
} as const satisfies AppearanceCarrierManifest;

type AppearanceCarrierKey = keyof typeof APPEARANCE_CARRIER_MANIFEST;

/** The settings that reach CSS on the root, each with the one name the writer, the boot replay, the generated CSS and the lint use. */
export interface AppearanceChannelRow {
  readonly key: AppearanceCarrierKey;
  readonly kind: "property" | "attribute";
  readonly name: string;
  readonly unit: AppearancePropertyUnit;
}

const APPEARANCE_PROPERTY_PREFIX = "--appearance-";
const APPEARANCE_ATTRIBUTE_PREFIX = "data-appearance-";

function kebab(key: string): string {
  return key.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

export const APPEARANCE_CHANNEL_ROWS: readonly AppearanceChannelRow[] = (Object.keys(APPEARANCE_CARRIER_MANIFEST) as AppearanceCarrierKey[]).flatMap(
  (key): AppearanceChannelRow[] => {
    const channel: AppearanceChannel = APPEARANCE_CARRIER_MANIFEST[key].channel;
    if (channel.kind === "none") {
      return [];
    }
    return channel.kind === "property"
      ? [{ key, kind: "property", name: `${APPEARANCE_PROPERTY_PREFIX}${kebab(key)}`, unit: channel.unit }]
      : [{ key, kind: "attribute", name: `${APPEARANCE_ATTRIBUTE_PREFIX}${kebab(key)}`, unit: "" }];
  },
);

const CHANNEL_BY_KEY: ReadonlyMap<AppearanceCarrierKey, AppearanceChannelRow> = new Map(APPEARANCE_CHANNEL_ROWS.map((row) => [row.key, row]));

/** The channel name a root-carried key writes; the call site names a key whose row declares a channel. */
export function appearanceChannelName(key: AppearanceCarrierKey): string {
  const row = CHANNEL_BY_KEY.get(key);
  if (row === undefined) {
    throw new Error(`appearance.${key} declares no CSS channel`);
  }
  return row.name;
}

/** An attribute carries a list as its space-separated members, so CSS matches one member with `~=`. */
function channelValue(value: AppearanceSettings[AppearanceCarrierKey]): string {
  return Array.isArray(value) ? value.map((member) => (typeof member === "string" ? member : "")).join(" ") : String(value);
}

/** The DOM surface the channel writes through; both writers pass `document.documentElement`. Structural, because
 *  the lint and the generator load this module without the DOM lib. */
interface AppearanceChannelRoot {
  readonly style: { readonly setProperty: (name: string, value: string) => void; readonly removeProperty: (name: string) => string };
  readonly setAttribute: (name: string, value: string) => void;
  readonly removeAttribute: (name: string) => void;
}

/** Write every given root-carried setting onto its channel. The shell writes the whole block; the boot replay writes the axes it remembers. */
export function writeAppearanceChannel(root: AppearanceChannelRoot, values: Partial<AppearanceSettings>): void {
  for (const row of APPEARANCE_CHANNEL_ROWS) {
    const value = values[row.key];
    if (value === undefined) {
      continue;
    }
    if (row.kind === "property") {
      root.style.setProperty(row.name, channelValue(value));
    } else {
      root.setAttribute(row.name, channelValue(value));
    }
  }
}

/** Remove the given keys' channel names, so an unmounted shell leaves no stale value on the root. */
export function clearAppearanceChannel(root: AppearanceChannelRoot, keys: readonly AppearanceCarrierKey[]): void {
  for (const key of keys) {
    const row = CHANNEL_BY_KEY.get(key);
    if (row?.kind === "property") {
      root.style.removeProperty(row.name);
    } else if (row?.kind === "attribute") {
      root.removeAttribute(row.name);
    }
  }
}

function rootObservable(key: AppearanceCarrierKey): AppearanceCarrierObservable {
  const name = appearanceChannelName(key);
  return CHANNEL_BY_KEY.get(key)?.kind === "property"
    ? { kind: "inline-style", selector: "html", signal: name }
    : { kind: "attribute", selector: "html", signal: name };
}

export type AppearanceCarrierObservable =
  | { readonly kind: "attribute"; readonly selector: string; readonly signal: string }
  | { readonly kind: "inline-style"; readonly selector: string; readonly signal: string }
  | { readonly kind: "message-prop"; readonly selector: string; readonly signal: string };

const LIVE_MESSAGE_ROW_SELECTOR = '[data-slot="message-row"]';

type AppearanceCarrierObservableManifest = {
  readonly [K in AppearanceCarrierKey as (typeof APPEARANCE_CARRIER_MANIFEST)[K] extends { readonly requiredDistinctArms: readonly [unknown, unknown] }
    ? K
    : never]: AppearanceCarrierObservable;
};

/** The browser-readable outcome for every two-arm row. The focused carrier matrix applies both declared
 * values through the real AppShell/message hooks and reads these signals; keeping the reader vocabulary
 * here makes an armed row without an executable observation a type error and a structural-gate red. */
export const APPEARANCE_CARRIER_OBSERVABLES = {
  chatWidthPct: rootObservable("chatWidthPct"),
  fontScale: rootObservable("fontScale"),
  density: { kind: "attribute", selector: '[data-slot="theme-scope"]:has(.shell-grid)', signal: "data-density" },
  elevation: { kind: "attribute", selector: ".shell-grid", signal: "data-elevation" },
  reducedMotion: rootObservable("reducedMotion"),
  blurSurfaces: rootObservable("blurSurfaces"),
  blurStrength: rootObservable("blurStrength"),
  shadowEffects: rootObservable("shadowEffects"),
  surfaceTexture: rootObservable("surfaceTexture"),
  enableThemeColorization: rootObservable("enableThemeColorization"),
  backgroundImageKind: { kind: "attribute", selector: ".shell-grid", signal: "data-has-bg-image" },
  backgroundFit: { kind: "inline-style", selector: '[data-slot="theme-background-layer"]', signal: "background-size" },
  backgroundDim: { kind: "inline-style", selector: '[data-slot="theme-background-scrim"]', signal: "opacity" },
  backgroundBlur: { kind: "inline-style", selector: '[data-slot="theme-background-layer"]', signal: "filter" },
  readingLineHeight: rootObservable("readingLineHeight"),
  readingLetterSpacing: rootObservable("readingLetterSpacing"),
  readingParagraphSpacing: rootObservable("readingParagraphSpacing"),
  readingNameScale: rootObservable("readingNameScale"),
  readingBodyScale: rootObservable("readingBodyScale"),
  justifyBodyText: rootObservable("justifyBodyText"),
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
} as const satisfies AppearanceCarrierObservableManifest;

/** How a theme observable's signals are read off its element: an attribute, the computed style (a custom
 *  property or a CSS property, inherited or inline), or the element's text. */
const THEME_OBSERVABLE_READS = ["attribute", "computed-style", "text-content"] as const;
export type ThemeObservableRead = (typeof THEME_OBSERVABLE_READS)[number];

interface ThemeCarrierObservable {
  readonly selector: string;
  readonly read: ThemeObservableRead;
  readonly signals: readonly string[];
  readonly lifecycle: AppearanceLifecycle;
}

/** Theme selection is adjacent to Appearance but is not one of its 41 schema leaves. These rendered
 * observables are what #953 must read after applying a theme request: an intercepted settings envelope
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
} as const satisfies Record<string, ThemeCarrierObservable>;

export interface AppearanceMatrixContractRow {
  readonly key: AppearanceCarrierKey;
  readonly owner: AppearanceEditorOwner;
  readonly carriers: readonly AppearanceCarrierPlane[];
  readonly consumer: AppearanceConsumerBinding;
  readonly lifecycle: AppearanceLifecycle;
  readonly portal: AppearancePortalObligation;
  readonly arms: readonly unknown[] | null;
  readonly dependsOn: readonly AppearanceCarrierKey[];
  readonly incompatibleWith: readonly AppearanceCarrierKey[];
  readonly observable: AppearanceCarrierObservable | null;
}

export interface AppearanceMatrixContract {
  readonly declared: number;
  readonly executable: number;
  readonly dependencies: number;
  readonly rows: readonly AppearanceMatrixContractRow[];
  readonly themeObservables: typeof THEME_CARRIER_OBSERVABLES;
  readonly historicalRows: typeof APPEARANCE_HISTORICAL_ROWS;
}

/** Browser-serializable matrix input derived from the executable manifest. #953's rated consumers must
 * join this carrier roster to `appearance-invariant-manifest.ts`'s seven literal historical policies;
 * copying selectors or flattening those policies into another matrix would sever source ownership.
 * The debug bridge adds current
 *  reached-subject counts; tooling never owns a second list of Appearance keys or arms. */
export function appearanceMatrixContract(): AppearanceMatrixContract {
  const rows = (Object.keys(APPEARANCE_CARRIER_MANIFEST) as AppearanceCarrierKey[]).map((key): AppearanceMatrixContractRow => {
    const row = APPEARANCE_CARRIER_MANIFEST[key];
    const executable = "requiredDistinctArms" in row;
    return {
      key,
      owner: row.owner,
      carriers: row.carriers,
      consumer: row.consumer,
      lifecycle: row.lifecycle,
      portal: row.portal,
      arms: executable ? row.requiredDistinctArms : null,
      dependsOn: "dependsOn" in row ? (row.dependsOn as readonly AppearanceCarrierKey[]) : [],
      incompatibleWith: "incompatibleWith" in row ? (row.incompatibleWith as readonly AppearanceCarrierKey[]) : [],
      observable: executable ? APPEARANCE_CARRIER_OBSERVABLES[key as keyof typeof APPEARANCE_CARRIER_OBSERVABLES] : null,
    };
  });
  const executable = rows.filter((row) => row.arms !== null).length;
  return {
    declared: rows.length,
    executable,
    dependencies: rows.length - executable,
    rows,
    themeObservables: THEME_CARRIER_OBSERVABLES,
    historicalRows: APPEARANCE_HISTORICAL_ROWS,
  };
}
