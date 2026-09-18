// The executable map from every Appearance setting to the DOM/prop plane that carries it (#935).
// Appearance is intentionally multi-plane: root-wide values must reach portals, density belongs on the
// ThemeScope shared by the grid and portal root, background media paints before that scope, and message
// skins stay prop-driven. This manifest describes those boundaries; it is not permission to collapse them.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { APPEARANCE_HISTORICAL_ROWS } from "./appearance-invariant-manifest.ts";

export const APPEARANCE_EDITOR_OWNERS = ["sizing", "effects", "background", "reading", "avatars", "message-style", "message-details"] as const;
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

export interface AppearanceConsumerBinding {
  readonly file: string;
  readonly symbol: string;
}

interface AppearanceCarrierRow<K extends keyof AppearanceSettings> {
  readonly owner: AppearanceEditorOwner;
  readonly carriers: readonly AppearanceCarrierPlane[];
  readonly consumer: AppearanceConsumerBinding;
  readonly lifecycle: AppearanceLifecycle;
  readonly portal: AppearancePortalObligation;
  readonly requiredDistinctArms?: readonly [AppearanceSettings[K], AppearanceSettings[K]];
  readonly dependsOn?: readonly (keyof AppearanceSettings)[];
  readonly incompatibleWith?: readonly (keyof AppearanceSettings)[];
}

type AppearanceCarrierManifest = { readonly [K in keyof AppearanceSettings]: AppearanceCarrierRow<K> };

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

const ROOT = { carriers: ["root-html"], lifecycle: "hydrated", portal: "must-reach-portals", consumer: APP_SHELL } as const;
const GRID = { carriers: ["shell-grid"], lifecycle: "hydrated", portal: "grid-only", consumer: APP_SHELL } as const;
const BACKGROUND = { carriers: ["background-layer"], lifecycle: "hydrated", portal: "outside-theme-scope", consumer: APP_SHELL } as const;
const MESSAGE = { carriers: ["message-props"], lifecycle: "hydrated", portal: "prop-threaded", consumer: MESSAGE_APPEARANCE } as const;
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
 * The 41-key contract. `satisfies AppearanceCarrierManifest` makes a missing/stale schema key a type error;
 * the appearance-carrier-contract gate independently reconciles this map with the Zod leaves, editor
 * tuples, and named live consumer declarations so a cast or an uncompiled tooling path cannot hide drift.
 */
export const APPEARANCE_CARRIER_MANIFEST = {
  chatWidthPct: { owner: "sizing", ...GRID, requiredDistinctArms: CHAT_WIDTH_ARMS },
  fontScale: { owner: "sizing", ...ROOT, lifecycle: "prepaint-and-hydrated", requiredDistinctArms: FONT_SCALE_ARMS },
  density: {
    owner: "sizing",
    carriers: ["theme-scope"],
    consumer: APP_SHELL,
    lifecycle: "hydrated-from-prepaint-hint",
    portal: "shared-theme-scope-sibling",
    requiredDistinctArms: ["comfortable", "compact"],
  },
  elevation: { owner: "sizing", ...GRID, requiredDistinctArms: ["flat", "ramp"] },
  reducedMotion: { owner: "sizing", ...ROOT, lifecycle: "prepaint-and-hydrated", requiredDistinctArms: [false, true] },

  blurSurfaces: { owner: "effects", ...ROOT, requiredDistinctArms: [[], ["panels"]] },
  blurStrength: { owner: "effects", ...ROOT, requiredDistinctArms: BLUR_STRENGTH_ARMS, dependsOn: ["blurSurfaces"] },
  shadowEffects: { owner: "effects", ...ROOT, requiredDistinctArms: [false, true] },
  surfaceTexture: { owner: "effects", ...ROOT, requiredDistinctArms: ["none", "grain"] },
  enableThemeColorization: { owner: "effects", ...ROOT, requiredDistinctArms: [false, true] },

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
    consumer: BACKGROUND_EDITOR,
    lifecycle: "hydrated",
    portal: "none",
    dependsOn: ["backgroundImageKind", "backgroundAssetId", "backgroundAssetHash", "backgroundAssetMime"],
  },
  backgroundFit: { owner: "background", ...BACKGROUND, requiredDistinctArms: ["cover", "contain"], dependsOn: ["backgroundImageKind"] },
  backgroundDim: { owner: "background", ...BACKGROUND, requiredDistinctArms: BACKGROUND_DIM_ARMS, dependsOn: ["backgroundImageKind"] },
  backgroundBlur: { owner: "background", ...BACKGROUND, requiredDistinctArms: BACKGROUND_BLUR_ARMS, dependsOn: ["backgroundImageKind"] },

  readingLineHeight: { owner: "reading", ...ROOT, requiredDistinctArms: READING_LINE_HEIGHT_ARMS },
  readingLetterSpacing: { owner: "reading", ...ROOT, requiredDistinctArms: READING_LETTER_SPACING_ARMS },
  readingParagraphSpacing: { owner: "reading", ...ROOT, requiredDistinctArms: READING_PARAGRAPH_SPACING_ARMS },
  readingNameScale: { owner: "reading", ...ROOT, requiredDistinctArms: READING_SCALE_ARMS },
  readingBodyScale: { owner: "reading", ...ROOT, requiredDistinctArms: READING_SCALE_ARMS },
  justifyBodyText: { owner: "reading", ...ROOT, requiredDistinctArms: [false, true] },

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

export type AppearanceCarrierKey = keyof typeof APPEARANCE_CARRIER_MANIFEST;

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
  chatWidthPct: { kind: "inline-style", selector: ".shell-grid", signal: "--width-shell-content" },
  fontScale: { kind: "inline-style", selector: "html", signal: "--font-scale" },
  density: { kind: "attribute", selector: '[data-slot="theme-scope"]:has(.shell-grid)', signal: "data-density" },
  elevation: { kind: "attribute", selector: ".shell-grid", signal: "data-elevation" },
  reducedMotion: { kind: "attribute", selector: "html", signal: "data-reduced-motion" },
  blurSurfaces: { kind: "attribute", selector: "html", signal: "data-blur-panels" },
  blurStrength: { kind: "inline-style", selector: "html", signal: "--blur-strength" },
  shadowEffects: { kind: "attribute", selector: "html", signal: "data-shadow" },
  surfaceTexture: { kind: "attribute", selector: "html", signal: "data-texture" },
  enableThemeColorization: { kind: "attribute", selector: "html", signal: "data-theme-colorization" },
  backgroundImageKind: { kind: "attribute", selector: ".shell-grid", signal: "data-has-bg-image" },
  backgroundFit: { kind: "inline-style", selector: '[data-slot="theme-background-layer"]', signal: "background-size" },
  backgroundDim: { kind: "inline-style", selector: '[data-slot="theme-background-scrim"]', signal: "opacity" },
  backgroundBlur: { kind: "inline-style", selector: '[data-slot="theme-background-layer"]', signal: "filter" },
  readingLineHeight: { kind: "inline-style", selector: "html", signal: "--reading-line-height" },
  readingLetterSpacing: { kind: "inline-style", selector: "html", signal: "--reading-letter-spacing" },
  readingParagraphSpacing: { kind: "inline-style", selector: "html", signal: "--reading-paragraph-spacing" },
  readingNameScale: { kind: "inline-style", selector: "html", signal: "--reading-name-scale" },
  readingBodyScale: { kind: "inline-style", selector: "html", signal: "--reading-body-scale" },
  justifyBodyText: { kind: "attribute", selector: "html", signal: "data-justify-body-text" },
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

/** Theme selection is adjacent to Appearance but is not one of its 41 schema leaves. These rendered
 * observables are what #953 must read after applying a theme request: an intercepted settings envelope
 * proves neither the palette that painted nor the polarity/custom-CSS planes that won. Nested scopes stay
 * independently observable because room/card overrides intentionally do not flatten into the app scope. */
export const THEME_CARRIER_OBSERVABLES = {
  seedRoot: { selector: "html", signals: ["data-theme"], lifecycle: "prepaint-and-hydrated" },
  activeScope: {
    selector: '[data-slot="theme-scope"]:has(.shell-grid)',
    signals: ["--color-background", "color-scheme"],
    lifecycle: "hydrated",
  },
  portalRoot: { selector: '[data-slot="portal-root"]', signals: ["--color-background", "color-scheme"], lifecycle: "hydrated" },
  carriedScope: {
    selector: '[data-slot="theme-scope"]:has(.shell-grid) [data-slot="theme-scope"]',
    signals: ["--color-background", "color-scheme"],
    lifecycle: "hydrated",
  },
  ownerCustomCss: { selector: "style[data-orb-theme-css]", signals: ["textContent"], lifecycle: "hydrated" },
} as const;

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

export function appearanceCarrierRowsFor(plane: AppearanceCarrierPlane): readonly AppearanceCarrierKey[] {
  return (Object.keys(APPEARANCE_CARRIER_MANIFEST) as AppearanceCarrierKey[]).filter((key) =>
    (APPEARANCE_CARRIER_MANIFEST[key].carriers as readonly AppearanceCarrierPlane[]).includes(plane),
  );
}
