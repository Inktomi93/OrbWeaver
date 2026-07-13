// The theme-editor form model: the flat form value shape, the mappers to Theme/CreateThemeInput,
// from-scratch defaults, and the themeable-var reference the CSS editor surfaces. Foregrounds and the
// neutral ramp are derived by <ThemeScope> (never picked), so this model carries no foreground fields.

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

/** From-scratch defaults — the Hearth seed values, so a new theme starts from a known-good, AA-passing palette. */
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

/** Read a `Theme` entity into the flat form values; missing override fields fall back to the defaults. */
export function themeFormFromEntity(theme: Theme): ThemeFormValues {
  const o = theme.override;
  return {
    name: theme.name,
    css: theme.css ?? "",
    ...paletteFormFieldsFromOverride(o),
  };
}

/** An empty string ⇒ the token drops from the override so <ThemeScope> derives/inherits it. */
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

/** Build the `ThemeOverride` from the flat form values. A cleared color field ("") is omitted so that token inherits/derives via <ThemeScope>. */
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

/** The themeable CSS custom properties an author may target in the custom-CSS box — sourced from THEME_SCOPE_EMIT_VARS so the reference never drifts. */
export const THEMEABLE_VARS: readonly string[] = THEME_SCOPE_EMIT_VARS;
