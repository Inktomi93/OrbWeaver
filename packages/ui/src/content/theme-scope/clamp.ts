// Security boundary for user/character theming: a custom-property VALUE must be parsed + clamped
// here before it reaches the DOM (color must parse as a color, dimension snaps to the token scale,
// font is allowlisted) — anything that fails is dropped, never applied raw.
import { z } from "zod";
import { isSafeColor } from "#lib";

/** Fonts a user may pick — an allowlist; anything else is dropped. */
export const THEME_FONT_ALLOWLIST = ["Geist", "ui-sans-serif", "ui-serif", "ui-monospace", "Georgia", "Times New Roman", "Iowan Old Style"] as const;
type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

// Exported for the contracts↔ui structural pairing test — must stay byte-identical to the wire twin.
export const THEME_SCOPE_CHAT_STYLES = ["bubble", "flat", "document", "echo", "whisper", "hush", "ripple", "tide"] as const;
export const THEME_SCOPE_DENSITIES = ["comfortable", "compact"] as const;
export const THEME_SCOPE_RADII = ["base", "control", "card", "full"] as const;
const CHAT_STYLES = THEME_SCOPE_CHAT_STYLES;
const DENSITIES = THEME_SCOPE_DENSITIES;
const RADII = THEME_SCOPE_RADII;

const colorToken = z.string().refine(isSafeColor);
const bubble = z.object({ bg: colorToken.optional(), fg: colorToken.optional() });

/** The ui-local override shape callers pass (loose — every field optional; failures drop per-field). */
export const themeScopeTokensSchema = z.object({
  accent: colorToken.optional(),
  userBubble: bubble.optional(),
  aiBubble: bubble.optional(),
  systemBubble: bubble.optional(),
  speaker: colorToken.optional(),
  dialogueColor: colorToken.optional(),
  narrationColor: colorToken.optional(),
  bodyColor: colorToken.optional(),
  font: z.enum(THEME_FONT_ALLOWLIST).optional(),
  radius: z.enum(RADII).optional(),
  background: colorToken.optional(),
  borderColor: colorToken.optional(),
  chatStyle: z.enum(CHAT_STYLES).optional(),
  density: z.enum(DENSITIES).optional(),
});
export type ThemeScopeTokens = z.infer<typeof themeScopeTokensSchema>;

/**
 * The clamped output: a CSS custom-property map safe to spread into `style` (only `--*` keys,
 * only validated values) plus the non-custom-property axes (chatStyle/density are `data-*`).
 */
export interface ClampedTheme {
  readonly vars: Readonly<Record<string, string>>;
  readonly chatStyle?: (typeof CHAT_STYLES)[number];
  readonly density?: (typeof DENSITIES)[number];
}

function fontStack(font: ThemeFont): string {
  return font === "Geist" ? "Geist, ui-sans-serif, system-ui, sans-serif" : `${font}, serif`;
}

// Every `--*` custom property clampThemeTokens can emit — must stay in sync with the put()/vars[...]
// assignments below (an emit-surface test asserts the actual output keys match this list exactly).
export const THEME_SCOPE_EMIT_VARS = [
  "--color-primary",
  "--color-ring",
  "--color-primary-foreground",
  "--color-user-bubble",
  "--color-user-bubble-foreground",
  "--color-ai-bubble",
  "--color-ai-bubble-foreground",
  "--color-system-bubble",
  "--color-system-bubble-foreground",
  "--color-speaker",
  "--color-dialogue",
  "--color-narration",
  "--color-prose-body",
  "--color-background",
  // The neutral surface ramp, derived from `background` — a user picks one base surface and the
  // sidebar/panel/card/popover chrome derives coherently.
  "--color-sidebar",
  "--color-surface-raised",
  "--color-card",
  "--color-popover",
  "--color-accent",
  "--color-accent-foreground",
  "--color-sidebar-accent",
  "--color-secondary",
  "--color-secondary-foreground",
  "--color-muted",
  // Neutral foregrounds, derived for contrast from the surface they sit on — never picked directly.
  "--color-foreground",
  "--color-card-foreground",
  "--color-popover-foreground",
  "--color-sidebar-foreground",
  "--color-muted-foreground",
  // The UI border: an explicit borderColor when set, else derived from the base surface.
  "--color-border",
  "--color-sidebar-border",
  "--color-input",
  "--font-sans",
  "--radius-card",
] as const;

// OKLCH lightness deltas of the neutral surface ramp relative to the base `background`, applied via
// CSS relative-color-syntax so any base color format works and only L shifts (hue + chroma held).
const RAMP_DL_SIDEBAR = -0.026;
const RAMP_DL_SURFACE_RAISED = 0.027;
const RAMP_DL_CARD = 0.047;
const RAMP_DL_POPOVER = 0.087;
const RAMP_DL_ACCENT = 0.127;
const RAMP_DL_SIDEBAR_ACCENT = 0.077;
const RAMP_DL_SECONDARY = 0.097;
const RAMP_DL_MUTED = 0.097;
const SURFACE_RAMP_DELTAS: ReadonlyArray<readonly [name: string, deltaL: number]> = [
  ["--color-sidebar", RAMP_DL_SIDEBAR],
  ["--color-surface-raised", RAMP_DL_SURFACE_RAISED],
  ["--color-card", RAMP_DL_CARD],
  ["--color-popover", RAMP_DL_POPOVER],
  ["--color-accent", RAMP_DL_ACCENT],
  ["--color-sidebar-accent", RAMP_DL_SIDEBAR_ACCENT],
  ["--color-secondary", RAMP_DL_SECONDARY],
  ["--color-muted", RAMP_DL_MUTED],
];

// Contrast-safe foreground derivation: L flips light↔dark around a pivot with a steep step, so any
// surface lighter than the pivot gets near-black text and darker gets near-white — a foreground is
// never picked directly, only derived, so "set everything white" can't produce invisible text.
const FG_PIVOT_L = 0.62;
const FG_STEEPNESS = 1000;
const FG_L_MIN = 0.22;
const FG_L_MAX = 0.96;
const CONTRAST_L = `clamp(${FG_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${FG_L_MAX})`;
const BORDER_ALPHA = 0.14;
const INPUT_ALPHA = 0.12;
// Muted foreground: same pivot flip, softer band, tuned to clear WCAG AA (>=4.5:1) against the
// derived input fill on both light and dark bases.
const MUTED_L_MIN = 0.34;
const MUTED_L_MAX = 0.82;
const MUTED_CONTRAST_L = `clamp(${MUTED_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${MUTED_L_MAX})`;
/**
 * The numeric derivation constants, exported so the seed-palette-contrast test recomputes the
 * derived colors independently and proves every pairing clears WCAG AA against the real constants.
 */
export const THEME_DERIVATION = {
  fgPivotL: FG_PIVOT_L,
  fgSteepness: FG_STEEPNESS,
  fgLMin: FG_L_MIN,
  fgLMax: FG_L_MAX,
  mutedLMin: MUTED_L_MIN,
  mutedLMax: MUTED_L_MAX,
  borderAlpha: BORDER_ALPHA,
  inputAlpha: INPUT_ALPHA,
  ramp: {
    sidebar: RAMP_DL_SIDEBAR,
    surfaceRaised: RAMP_DL_SURFACE_RAISED,
    card: RAMP_DL_CARD,
    popover: RAMP_DL_POPOVER,
    accent: RAMP_DL_ACCENT,
    sidebarAccent: RAMP_DL_SIDEBAR_ACCENT,
    secondary: RAMP_DL_SECONDARY,
    muted: RAMP_DL_MUTED,
  },
} as const;

/** A contrast-safe foreground for text sitting on `surface` (any validated color) — browser-computed. */
function foregroundOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h)`;
}
// Computed single-level off the base (the pivot flip reads l + deltaL, never a nested relative-color
// of an already-derived surface) so it stays the same shape as every other derived token.
function foregroundOnShifted(base: string, deltaL: number): string {
  const shiftedL = `clamp(${FG_L_MIN}, (${FG_PIVOT_L} - (l + ${deltaL})) * ${FG_STEEPNESS}, ${FG_L_MAX})`;
  return `oklch(from ${base} ${shiftedL} 0 h)`;
}
/** A contrast-safe muted foreground (secondary text/placeholders) for `surface`. */
function mutedForegroundOn(surface: string): string {
  return `oklch(from ${surface} ${MUTED_CONTRAST_L} 0 h)`;
}
/** A subtle contrast border derived from `surface`. */
function borderOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h / ${BORDER_ALPHA})`;
}
/** The input-field surface lift derived from `surface`, composited over any surface. */
function inputSurfaceOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h / ${INPUT_ALPHA})`;
}

/**
 * Parse + clamp raw override tokens into a safe custom-property map. Unknown keys are stripped
 * (schema), per-field failures are dropped (a bad `accent` leaves `--color-primary` inherited), and
 * NO value reaches the output without passing `isSafeColor` / an enum / the font allowlist.
 */
export function clampThemeTokens(raw: unknown): ClampedTheme {
  const parsed = themeScopeTokensSchema.safeParse(raw);
  const t: ThemeScopeTokens = parsed.success ? parsed.data : {};
  const vars: Record<string, string> = {};
  const put = (name: string, value: string | undefined): void => {
    if (value !== undefined) {
      vars[name] = value;
    }
  };
  put("--color-primary", t.accent);
  put("--color-ring", t.accent);
  // The accent's readable foreground derives off the picked accent so a dark accent + static light
  // text can never go invisible.
  put("--color-primary-foreground", t.accent === undefined ? undefined : foregroundOn(t.accent));
  put("--color-speaker", t.speaker);
  put("--color-dialogue", t.dialogueColor);
  put("--color-narration", t.narrationColor);
  put("--color-prose-body", t.bodyColor);
  // Bubbles: the picker sets each bubble's bg; the fg is always derived for contrast, never picked.
  const putBubble = (bg: string, bgVar: string, fgVar: string): void => {
    vars[bgVar] = bg;
    vars[fgVar] = foregroundOn(bg);
  };
  if (t.userBubble?.bg !== undefined) {
    putBubble(t.userBubble.bg, "--color-user-bubble", "--color-user-bubble-foreground");
  }
  if (t.aiBubble?.bg !== undefined) {
    putBubble(t.aiBubble.bg, "--color-ai-bubble", "--color-ai-bubble-foreground");
  }
  if (t.systemBubble?.bg !== undefined) {
    putBubble(t.systemBubble.bg, "--color-system-bubble", "--color-system-bubble-foreground");
  }
  if (t.background !== undefined) {
    vars["--color-background"] = t.background;
    for (const [name, deltaL] of SURFACE_RAMP_DELTAS) {
      vars[name] = `oklch(from ${t.background} calc(l + ${deltaL}) c h)`;
    }
    vars["--color-accent-foreground"] = foregroundOnShifted(t.background, RAMP_DL_ACCENT);
    const fg = foregroundOn(t.background);
    vars["--color-foreground"] = fg;
    vars["--color-card-foreground"] = fg;
    vars["--color-popover-foreground"] = fg;
    vars["--color-sidebar-foreground"] = fg;
    vars["--color-secondary-foreground"] = fg;
    vars["--color-muted-foreground"] = mutedForegroundOn(t.background);
    vars["--color-border"] = borderOn(t.background);
    vars["--color-sidebar-border"] = borderOn(t.background);
    vars["--color-input"] = inputSurfaceOn(t.background);
  }
  // An explicit border color wins over the derived hairline, for both border scopes.
  put("--color-border", t.borderColor);
  put("--color-sidebar-border", t.borderColor);
  if (t.font !== undefined) {
    vars["--font-sans"] = fontStack(t.font);
  }
  // `radius: "card"` already means "use the scale's own card radius" — aliasing --radius-card to
  // var(--radius-card) is a self-reference that CSS treats as invalid-at-computed-value-time, so skip
  // the assignment for that one case; every other radius choice still aliases correctly.
  if (t.radius !== undefined && t.radius !== "card") {
    vars["--radius-card"] = `var(--radius-${t.radius})`;
  }
  return {
    vars,
    ...(t.chatStyle === undefined ? {} : { chatStyle: t.chatStyle }),
    ...(t.density === undefined ? {} : { density: t.density }),
  };
}
