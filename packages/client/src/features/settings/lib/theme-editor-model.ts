// The theme-editor form MODEL (D44 §12.1 · themes-design §3.2): the flat form value shape the editor
// binds, the ⇄ mappers to the `Theme` entity / `CreateThemeInput`, sensible (Hearth-derived) defaults for
// a from-scratch theme, a browser-based WCAG contrast helper (Tier-2 readability feedback), and the
// themeable-var reference the CSS editor surfaces. The picker exposes only the SEED set (surfaces + accent
// + the RP text colors + the 3 bubble bgs + border + font/radius/chatStyle/density); the neutral ramp AND
// all foregrounds are DERIVED by <ThemeScope> (never picked) — so this model carries no foreground fields.

import type {
  CreateThemeInput,
  Theme,
  ThemeBackgroundFit,
  ThemeChatStyle,
  ThemeDensity,
  ThemeFont,
  ThemeOverride,
  ThemeRadius,
} from "@orb/contracts/theme";
import { THEME_SCOPE_EMIT_VARS } from "@orb/ui/theme-scope";

/** WS3 D49 §3 — the background-image picker's source axis. `"asset"` (own upload) is DELIBERATELY
 *  excluded (PD-131 — no client asset-URL resolver/upload flow exists yet); the picker offers only the
 *  two sources that actually resolve. `"none"` is the picker-only "no image" state (the form never
 *  emits it onto the wire — `themeOverrideFromForm` omits `backgroundImage` entirely for it). The TYPE
 *  stays file-local (client feature dirs have no `contract/` bucket + `export type` is gate-banned
 *  there, `no-inline-types` — the `message-row-variants.ts` `ChatStyle` precedent); consumers key off
 *  the exported array / `ThemeFormValues["backgroundImageSource"]`. */
export const BACKGROUND_IMAGE_SOURCES = ["none", "seeded", "external"] as const;
type BackgroundImageSourceKind = (typeof BACKGROUND_IMAGE_SOURCES)[number];

/** The flat form value shape (nested `userBubble{bg}` is flattened to `userBubbleBg` for a bound field). */
export interface ThemeFormValues {
  readonly name: string;
  readonly background: string;
  readonly accent: string;
  readonly borderColor: string;
  readonly speaker: string;
  readonly dialogueColor: string;
  readonly narrationColor: string;
  readonly bodyColor: string;
  readonly userBubbleBg: string;
  readonly aiBubbleBg: string;
  readonly systemBubbleBg: string;
  readonly font: ThemeFont;
  readonly radius: ThemeRadius;
  readonly chatStyle: ThemeChatStyle;
  readonly density: ThemeDensity;
  readonly css: string;
  /** WS3 D49 §3 background-image picker (flattened, mirrors the bubble-bg flattening precedent above). */
  readonly backgroundImageSource: BackgroundImageSourceKind;
  readonly backgroundSeededId: string;
  readonly backgroundExternalUrl: string;
  readonly backgroundFit: ThemeBackgroundFit;
  readonly backgroundDim: number;
}

/** From-scratch defaults — the Hearth seed values, so a new theme starts from a known-good, AA-passing
 *  palette (the customizer only earns Tier-2 warnings when they break it). */
export const DEFAULT_THEME_FORM: ThemeFormValues = {
  name: "New theme",
  background: "oklch(0.158 0.006 60)",
  accent: "oklch(0.72 0.175 52)",
  borderColor: "",
  speaker: "oklch(0.72 0.175 52)",
  dialogueColor: "oklch(0.955 0.004 75)",
  narrationColor: "oklch(0.78 0.02 70)",
  bodyColor: "oklch(0.9 0.008 72)",
  userBubbleBg: "oklch(0.255 0.007 60)",
  aiBubbleBg: "oklch(0.205 0.006 60)",
  systemBubbleBg: "oklch(0.255 0.006 60)",
  font: "Geist",
  radius: "card",
  chatStyle: "bubble",
  density: "comfortable",
  css: "",
  backgroundImageSource: "none",
  backgroundSeededId: "",
  backgroundExternalUrl: "",
  backgroundFit: "cover",
  backgroundDim: 0.45,
};

/** Read a `Theme` entity's `backgroundImage` union into the picker's flat fields — the mirror image of
 *  `backgroundImageFromForm` below. An `asset` source (PD-131 — unreachable via the picker) still reads
 *  back as `"none"` so an existing (server-authored or pre-#67) asset override doesn't crash the form;
 *  saving again would silently drop it, which is acceptable for a picker that never offers it. */
function backgroundFormFieldsFromOverride(
  o: ThemeOverride,
): Pick<ThemeFormValues, "backgroundImageSource" | "backgroundSeededId" | "backgroundExternalUrl"> {
  const image = o.backgroundImage;
  if (image === undefined || image.kind === "asset") {
    return { backgroundImageSource: "none", backgroundSeededId: "", backgroundExternalUrl: "" };
  }
  if (image.kind === "seeded") {
    return {
      backgroundImageSource: "seeded",
      backgroundSeededId: image.id,
      backgroundExternalUrl: "",
    };
  }
  return {
    backgroundImageSource: "external",
    backgroundSeededId: "",
    backgroundExternalUrl: image.url,
  };
}

/** The seed-value-fallback half of `themeFormFromEntity` (split out to keep either function's cognitive
 *  complexity under the gate — this one is pure `?? default` repetition, no branching). */
function paletteFormFieldsFromOverride(
  o: ThemeOverride,
): Omit<
  ThemeFormValues,
  | "name"
  | "css"
  | "backgroundImageSource"
  | "backgroundSeededId"
  | "backgroundExternalUrl"
  | "backgroundFit"
  | "backgroundDim"
> {
  return {
    background: o.background ?? DEFAULT_THEME_FORM.background,
    accent: o.accent ?? DEFAULT_THEME_FORM.accent,
    borderColor: o.borderColor ?? "",
    speaker: o.speaker ?? DEFAULT_THEME_FORM.speaker,
    dialogueColor: o.dialogueColor ?? DEFAULT_THEME_FORM.dialogueColor,
    narrationColor: o.narrationColor ?? DEFAULT_THEME_FORM.narrationColor,
    bodyColor: o.bodyColor ?? DEFAULT_THEME_FORM.bodyColor,
    userBubbleBg: o.userBubble?.bg ?? DEFAULT_THEME_FORM.userBubbleBg,
    aiBubbleBg: o.aiBubble?.bg ?? DEFAULT_THEME_FORM.aiBubbleBg,
    systemBubbleBg: o.systemBubble?.bg ?? DEFAULT_THEME_FORM.systemBubbleBg,
    font: o.font ?? DEFAULT_THEME_FORM.font,
    radius: o.radius ?? DEFAULT_THEME_FORM.radius,
    chatStyle: o.chatStyle ?? DEFAULT_THEME_FORM.chatStyle,
    density: o.density ?? DEFAULT_THEME_FORM.density,
  };
}

/** Read a `Theme` entity into the flat form values (missing override fields fall back to the defaults so
 *  every picker starts on a valid color). */
export function themeFormFromEntity(theme: Theme): ThemeFormValues {
  const o = theme.override;
  return {
    name: theme.name,
    css: theme.css ?? "",
    ...paletteFormFieldsFromOverride(o),
    ...backgroundFormFieldsFromOverride(o),
    backgroundFit: o.backgroundFit ?? DEFAULT_THEME_FORM.backgroundFit,
    backgroundDim: o.backgroundDim ?? DEFAULT_THEME_FORM.backgroundDim,
  };
}

/** The picker's flat fields → the wire `backgroundImage` union (`undefined` for `"none"` — the form
 *  never emits an empty/degenerate source onto the wire). A blank seeded/external value degrades to
 *  `"none"` rather than persisting a broken reference (the picker's own dropdown/text-field guards this
 *  too, but a defensive floor here means a hand-edited draft can't smuggle one through). */
function backgroundImageFromForm(v: ThemeFormValues): ThemeOverride["backgroundImage"] {
  if (v.backgroundImageSource === "seeded" && v.backgroundSeededId.trim() !== "") {
    return { kind: "seeded", id: v.backgroundSeededId };
  }
  return v.backgroundImageSource === "external" && v.backgroundExternalUrl.trim() !== ""
    ? { kind: "external", url: v.backgroundExternalUrl }
    : undefined;
}

/** Build the `ThemeOverride` from the flat form values (an empty `borderColor` string ⇒ omit it, so the
 *  border derives from the base surface). Bubble foregrounds are NOT set — they derive at apply-time. */
export function themeOverrideFromForm(v: ThemeFormValues): ThemeOverride {
  const backgroundImage = backgroundImageFromForm(v);
  return {
    background: v.background,
    accent: v.accent,
    ...(v.borderColor.trim() === "" ? {} : { borderColor: v.borderColor }),
    speaker: v.speaker,
    dialogueColor: v.dialogueColor,
    narrationColor: v.narrationColor,
    bodyColor: v.bodyColor,
    userBubble: { bg: v.userBubbleBg },
    aiBubble: { bg: v.aiBubbleBg },
    systemBubble: { bg: v.systemBubbleBg },
    ...(backgroundImage === undefined
      ? {}
      : { backgroundImage, backgroundFit: v.backgroundFit, backgroundDim: v.backgroundDim }),
    font: v.font,
    radius: v.radius,
    chatStyle: v.chatStyle,
    density: v.density,
  };
}

/** Build the create/update input from the form values. */
export function themeInputFromForm(v: ThemeFormValues): CreateThemeInput {
  return {
    name: v.name,
    override: themeOverrideFromForm(v),
    css: v.css.trim() === "" ? null : v.css,
  };
}

// ── WCAG contrast (Tier-2 readability feedback) ────────────────────────────────────────────────────
// Browser-resolved: any CSS color (oklch / relative / hex / named) → rgb via getComputedStyle, then the
// standard WCAG relative-luminance + contrast-ratio. Runs only in the editor (a settings surface, not a
// hot path). Returns null when a color can't be resolved (SSR/degenerate) — the caller shows no badge.
const SRGB_MAX = 255;
// biome-ignore lint/style/useNumericSeparators: the WCAG sRGB linearization threshold — a standard constant; separators would obscure it.
const SRGB_THRESHOLD = 0.03928;
const SRGB_LINEAR_DIV = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
const CONTRAST_OFFSET = 0.05;
const RGB_RE = /rgba?\(([^)]+)\)/;

/** WCAG AA floor for body text. Below this, the editor shows a "hard to read" warning (non-blocking). */
export const AA_CONTRAST_FLOOR = 4.5;

function resolveRgb(color: string): readonly [number, number, number] | null {
  if (typeof document === "undefined") {
    return null;
  }
  const el = document.createElement("span");
  el.style.color = color;
  el.style.display = "none";
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  const match = RGB_RE.exec(computed);
  if (match?.[1] === undefined) {
    return null;
  }
  const parts = match[1].split(",").map((s) => Number.parseFloat(s));
  const [r, g, b] = parts;
  return r === undefined || g === undefined || b === undefined ? null : [r, g, b];
}

function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const lin = (channel: number): number => {
    const c = channel / SRGB_MAX;
    return c <= SRGB_THRESHOLD
      ? c / SRGB_LINEAR_DIV
      : ((c + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  };
  return LUMA_R * lin(r) + LUMA_G * lin(g) + LUMA_B * lin(b);
}

/** The WCAG contrast ratio (1–21) between two CSS colors, or null if either can't be resolved. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = resolveRgb(foreground);
  const bg = resolveRgb(background);
  if (fg === null || bg === null) {
    return null;
  }
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}

/** The themeable CSS custom properties an author may target in the custom-CSS box — sourced from the ONE
 *  machine-current list (`THEME_SCOPE_EMIT_VARS`), so the reference never drifts from what actually emits. */
export const THEMEABLE_VARS: readonly string[] = THEME_SCOPE_EMIT_VARS;
