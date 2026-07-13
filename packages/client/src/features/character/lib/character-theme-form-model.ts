// The per-character theme form model — the flat, all-string value shape the Appearance tab's autosave
// form binds, plus the mappers to/from the sparse `ThemeOverride` blob. A field left on its sentinel (an
// empty colour string, or `INHERIT` for an enum) is omitted from the built override, so that token
// inherits the parent scope; all-sentinel collapses the override to `null`.

import type {
  ThemeChatStyle,
  ThemeDensity,
  ThemeOverride,
  ThemeRadius,
} from "@orb/contracts/theme";

/** The enum-field sentinel: this control is unset → the token inherits the parent scope. */
export const THEME_INHERIT = "inherit";

/** The flat form value shape — every field a STRING (the bound `ColorField`/`SelectField` are string-valued;
 *  colours carry "" when unset, enums carry `THEME_INHERIT`). Bubbles are flattened to `*Bg`/`*Fg`. */
export interface CharacterThemeFormValues {
  readonly background: string;
  readonly accent: string;
  readonly borderColor: string;
  readonly speaker: string;
  readonly dialogueColor: string;
  readonly narrationColor: string;
  readonly bodyColor: string;
  readonly userBubbleBg: string;
  readonly userBubbleFg: string;
  readonly aiBubbleBg: string;
  readonly aiBubbleFg: string;
  readonly systemBubbleBg: string;
  readonly systemBubbleFg: string;
  readonly font: string;
  readonly radius: string;
  readonly chatStyle: string;
  readonly density: string;
}

/** The all-inherit seed (a character with no override). Also the target "Reset to global" clears every
 *  field to — which the mapper then reads as the whole override going `null`. */
export const EMPTY_CHARACTER_THEME_FORM: CharacterThemeFormValues = {
  background: "",
  accent: "",
  borderColor: "",
  speaker: "",
  dialogueColor: "",
  narrationColor: "",
  bodyColor: "",
  userBubbleBg: "",
  userBubbleFg: "",
  aiBubbleBg: "",
  aiBubbleFg: "",
  systemBubbleBg: "",
  systemBubbleFg: "",
  font: THEME_INHERIT,
  radius: THEME_INHERIT,
  chatStyle: THEME_INHERIT,
  density: THEME_INHERIT,
};

// Split in two to keep either function's `??` count under the cognitive-complexity gate.

function colorFieldsFromOverride(
  o: ThemeOverride,
): Pick<
  CharacterThemeFormValues,
  | "background"
  | "accent"
  | "borderColor"
  | "speaker"
  | "dialogueColor"
  | "narrationColor"
  | "bodyColor"
  | "userBubbleBg"
  | "userBubbleFg"
  | "aiBubbleBg"
  | "aiBubbleFg"
  | "systemBubbleBg"
  | "systemBubbleFg"
> {
  return {
    background: o.background ?? "",
    accent: o.accent ?? "",
    borderColor: o.borderColor ?? "",
    speaker: o.speaker ?? "",
    dialogueColor: o.dialogueColor ?? "",
    narrationColor: o.narrationColor ?? "",
    bodyColor: o.bodyColor ?? "",
    userBubbleBg: o.userBubble?.bg ?? "",
    userBubbleFg: o.userBubble?.fg ?? "",
    aiBubbleBg: o.aiBubble?.bg ?? "",
    aiBubbleFg: o.aiBubble?.fg ?? "",
    systemBubbleBg: o.systemBubble?.bg ?? "",
    systemBubbleFg: o.systemBubble?.fg ?? "",
  };
}

/** Read a `ThemeOverride` (or null) into the flat form values — the autosave form's mount seed. */
export function characterThemeFormFromOverride(
  override: ThemeOverride | null,
): CharacterThemeFormValues {
  if (override === null) {
    return EMPTY_CHARACTER_THEME_FORM;
  }
  return {
    ...colorFieldsFromOverride(override),
    font: override.font ?? THEME_INHERIT,
    radius: override.radius ?? THEME_INHERIT,
    chatStyle: override.chatStyle ?? THEME_INHERIT,
    density: override.density ?? THEME_INHERIT,
  };
}

const COLOR_KEYS = [
  "background",
  "accent",
  "borderColor",
  "speaker",
  "dialogueColor",
  "narrationColor",
  "bodyColor",
] as const;

function bubbleFromForm(bg: string, fg: string): { bg?: string; fg?: string } | undefined {
  const next: { bg?: string; fg?: string } = {};
  if (bg.trim() !== "") {
    next.bg = bg;
  }
  if (fg.trim() !== "") {
    next.fg = fg;
  }
  return next.bg === undefined && next.fg === undefined ? undefined : next;
}

/** Build the sparse `ThemeOverride` the wire carries — every sentinel field omitted; `null` when nothing is set. */
export function overrideFromCharacterThemeForm(v: CharacterThemeFormValues): ThemeOverride | null {
  const o: ThemeOverride = {};
  for (const key of COLOR_KEYS) {
    if (v[key].trim() !== "") {
      o[key] = v[key];
    }
  }
  const userBubble = bubbleFromForm(v.userBubbleBg, v.userBubbleFg);
  if (userBubble !== undefined) {
    o.userBubble = userBubble;
  }
  const aiBubble = bubbleFromForm(v.aiBubbleBg, v.aiBubbleFg);
  if (aiBubble !== undefined) {
    o.aiBubble = aiBubble;
  }
  const systemBubble = bubbleFromForm(v.systemBubbleBg, v.systemBubbleFg);
  if (systemBubble !== undefined) {
    o.systemBubble = systemBubble;
  }
  if (v.font !== THEME_INHERIT) {
    o.font = v.font as ThemeOverride["font"];
  }
  if (v.radius !== THEME_INHERIT) {
    o.radius = v.radius as ThemeRadius;
  }
  if (v.chatStyle !== THEME_INHERIT) {
    o.chatStyle = v.chatStyle as ThemeChatStyle;
  }
  if (v.density !== THEME_INHERIT) {
    o.density = v.density as ThemeDensity;
  }
  return Object.keys(o).length === 0 ? null : o;
}
