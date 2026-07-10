// The theme-editor form MODEL (D44 §12.1 · themes-design §3.2): the flat form value shape the editor
// binds, the ⇄ mappers to the `Theme` entity / `CreateThemeInput`, sensible (Hearth-derived) defaults for
// a from-scratch theme, and the themeable-var reference the CSS editor surfaces (the browser-based WCAG
// contrast helper lives in the sibling `theme-contrast`, kept out so this model stays DOM-free). The
// picker exposes only the SEED set (surfaces + accent
// + the RP text colors + the 3 bubble bgs + border + font/radius/chatStyle/density); the neutral ramp AND
// all foregrounds are DERIVED by <ThemeScope> (never picked) — so this model carries no foreground fields.

import type {
  CreateThemeInput,
  Theme,
  ThemeChatStyle,
  ThemeDensity,
  ThemeFont,
  ThemeOverride,
  ThemeRadius,
} from "@orb/contracts/theme";
import { THEME_SCOPE_EMIT_VARS } from "@orb/ui/theme-scope";

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
};

/** The seed-value-fallback half of `themeFormFromEntity` (split out to keep either function's cognitive
 *  complexity under the gate — this one is pure `?? default` repetition, no branching). */
function paletteFormFieldsFromOverride(o: ThemeOverride): Omit<ThemeFormValues, "name" | "css"> {
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
  };
}

/** The clearable color fields — an empty string ⇒ OMIT (the ColorField per-field clear, FINAL-Character
 *  §8.1): the token drops from the override so <ThemeScope> derives/inherits it (a cleared `background`
 *  falls back to the app default surface; a cleared `borderColor` derives from the base surface). */
const CLEARABLE_COLOR_KEYS = [
  "background",
  "accent",
  "borderColor",
  "speaker",
  "dialogueColor",
  "narrationColor",
  "bodyColor",
] as const;

/** A bubble bg → `{ bg }` unless cleared (empty ⇒ omit the whole bubble so it inherits). */
function bubbleFromBg(bg: string): { bg: string } | undefined {
  return bg.trim() === "" ? undefined : { bg };
}

/** Build the `ThemeOverride` from the flat form values. A cleared color field ("" — the ColorField's
 *  per-field clear) is OMITTED so that token inherits/derives via <ThemeScope> rather than shipping a
 *  literal empty color. Enum fields (font/radius/style/density) are fixed-choice Selects, never cleared.
 *  Bubble foregrounds are NOT set — they derive at apply-time. */
export function themeOverrideFromForm(v: ThemeFormValues): ThemeOverride {
  const o: ThemeOverride = {
    font: v.font,
    radius: v.radius,
    chatStyle: v.chatStyle,
    density: v.density,
  };
  for (const key of CLEARABLE_COLOR_KEYS) {
    if (v[key].trim() !== "") {
      o[key] = v[key];
    }
  }
  const userBubble = bubbleFromBg(v.userBubbleBg);
  if (userBubble !== undefined) {
    o.userBubble = userBubble;
  }
  const aiBubble = bubbleFromBg(v.aiBubbleBg);
  if (aiBubble !== undefined) {
    o.aiBubble = aiBubble;
  }
  const systemBubble = bubbleFromBg(v.systemBubbleBg);
  if (systemBubble !== undefined) {
    o.systemBubble = systemBubble;
  }
  return o;
}

/** Build the create/update input from the form values. */
export function themeInputFromForm(v: ThemeFormValues): CreateThemeInput {
  return {
    name: v.name,
    override: themeOverrideFromForm(v),
    css: v.css.trim() === "" ? null : v.css,
  };
}

// WCAG contrast feedback (AA_CONTRAST_FLOOR / contrastRatio) lives in the sibling `theme-contrast` — it
// is browser-only (getComputedStyle) and kept OUT of this model so the mappers stay DOM-free/node-testable.

/** The themeable CSS custom properties an author may target in the custom-CSS box — sourced from the ONE
 *  machine-current list (`THEME_SCOPE_EMIT_VARS`), so the reference never drifts from what actually emits. */
export const THEMEABLE_VARS: readonly string[] = THEME_SCOPE_EMIT_VARS;
