// The executable map from every Appearance setting to the DOM/prop plane that carries it (#935).
// Appearance is intentionally multi-plane: root-wide values must reach portals, density belongs on the
// ThemeScope shared by the grid and portal root, background media paints before that scope, and message
// skins stay prop-driven. This manifest describes those boundaries; it is not permission to collapse them.

import type { AppearanceSettings } from "@orb/contracts/settings";

export const APPEARANCE_EDITOR_OWNERS = ["sizing", "effects", "background", "reading", "avatars", "message-style", "message-details"] as const;
export type AppearanceEditorOwner = (typeof APPEARANCE_EDITOR_OWNERS)[number];

export const APPEARANCE_CARRIER_PLANES = ["root-html", "theme-scope", "shell-grid", "background-layer", "message-props", "source-catalog"] as const;
export type AppearanceCarrierPlane = (typeof APPEARANCE_CARRIER_PLANES)[number];

export type AppearanceLifecycle = "prepaint-and-hydrated" | "hydrated" | "hydrated-from-prepaint-hint";
export type AppearancePortalObligation = "must-reach-portals" | "shared-theme-scope-sibling" | "grid-only" | "outside-theme-scope" | "prop-threaded" | "none";

export interface AppearanceConsumerBinding {
  readonly file: string;
  readonly symbol: string;
}

export interface AppearanceCarrierRow<K extends keyof AppearanceSettings> {
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
    "backgroundSeededId",
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

  backgroundImageKind: { owner: "background", ...BACKGROUND, consumer: BACKGROUND_SOURCE, requiredDistinctArms: ["none", "seeded"] },
  backgroundSeededId: { owner: "background", ...BACKGROUND, consumer: BACKGROUND_SOURCE, dependsOn: ["backgroundImageKind"] },
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

export function appearanceCarrierRowsFor(plane: AppearanceCarrierPlane): readonly AppearanceCarrierKey[] {
  return (Object.keys(APPEARANCE_CARRIER_MANIFEST) as AppearanceCarrierKey[]).filter((key) =>
    (APPEARANCE_CARRIER_MANIFEST[key].carriers as readonly AppearanceCarrierPlane[]).includes(plane),
  );
}
