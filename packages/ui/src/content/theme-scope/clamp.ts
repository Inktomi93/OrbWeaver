// The D44 §12.1 token-override CLAMP — the security boundary for user/character theming. This is the
// ui-local twin of `@orb/contracts/theme` `ThemeOverride` (ui CANNOT import @orb/contracts — the cake;
// the contracts↔ui structural pairing is asserted in the client phase, ui-package-design §1/§10.5).
//
// GOVERNING RULE (D44 §12.0/§12.1): a custom-property VALUE cannot select, execute, or exfiltrate — but
// only if it is PARSED + CLAMPED at the boundary. A color must parse as a color (reject url()/expression()/
// injection); a dimension snaps to the token scale; a font must be allowlisted. Anything that fails is
// DROPPED (the inherited token shows through) — never applied raw. This is what makes ThemeScope safe
// where SillyTavern's raw `--SmartTheme*` vars are not.
import { z } from "zod";
import { isSafeColor } from "#lib";

// The color predicate lives in `#lib/safe-color` (floor-homed — color-field, a PRIMITIVE, shares it
// and a primitive may not reach up into content/; the ui internal cake).

/** Fonts a user may pick — an allowlist (D44 §12.1 "font (allowlist)"); anything else is dropped. */
export const THEME_FONT_ALLOWLIST = [
  "Geist",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "Georgia",
  "Times New Roman",
  "Iowan Old Style",
] as const;
type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

// Exported for the contracts↔ui structural PAIRING test (D44 §12.5: the wire schema in
// `@orb/contracts/theme` and this render clamp are a deliberate cake-forced two-copy; the pairing
// suite imports both packages and asserts identical key sets / enums / font allowlist).
export const THEME_SCOPE_CHAT_STYLES = ["bubble", "flat", "document"] as const;
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
 * The clamped output: a CSS custom-property map safe to spread into `style` (only `--*` keys, only
 * validated values) plus the non-custom-property axes (chatStyle/density are `data-*`). The decorative
 * background IMAGE is NOT here (D63): it moved off the theme to the `appearance` user-settings namespace,
 * palette-independent — ThemeScope now emits only color/enum vars.
 */
export interface ClampedTheme {
  readonly vars: Readonly<Record<string, string>>;
  readonly chatStyle?: (typeof CHAT_STYLES)[number];
  readonly density?: (typeof DENSITIES)[number];
}

function fontStack(font: ThemeFont): string {
  return font === "Geist" ? "Geist, ui-sans-serif, system-ui, sans-serif" : `${font}, serif`;
}

/**
 * Every `--*` custom property `clampThemeTokens` can emit into `ClampedTheme.vars` — the themeable
 * surface (WS0). MUST stay in sync with the `put()`/`vars[...]` assignments below (the emit-surface
 * test in tests/ui/content/theme-scope/emit-surface.test.ts calls `clampThemeTokens` with every field
 * populated and asserts the actual output keys match this list exactly, so a drift fails loudly).
 * Exported so that test reads the surface structurally instead of re-parsing this file.
 */
export const THEME_SCOPE_EMIT_VARS = [
  "--color-primary",
  "--color-ring",
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
  // The neutral surface RAMP, DERIVED from `background` (below) — a user picks ONE base surface and the
  // sidebar/panel/card/popover chrome derives coherently; they never hand-pick the neutral ramp.
  "--color-sidebar",
  "--color-surface-raised",
  "--color-card",
  "--color-popover",
  // The neutral FOREGROUNDS, DERIVED for contrast from the surface they sit on (light surface → dark
  // text, dark surface → light text) — so "set the background white" can never yield invisible text. The
  // picker never sets these; they're computed. (Bubble foregrounds — also derived — reuse the keys above.)
  "--color-foreground",
  "--color-card-foreground",
  "--color-popover-foreground",
  "--color-sidebar-foreground",
  // The UI border — an explicit `borderColor` when set, else DERIVED from the base surface (a low-alpha
  // contrast hairline, so it stays visible on light AND dark bases).
  "--color-border",
  "--font-sans",
  "--radius-card",
] as const;

// OKLCH lightness deltas of the neutral surface ramp RELATIVE to the base `background` (they match
// Hearth's authored deltas vs its 0.158 background: sidebar 0.132, surface-raised 0.185, card 0.205,
// popover 0.245). Applied via CSS relative-color-syntax so ANY base color format works and the browser
// does the math; same hue + chroma, only L shifts.
const RAMP_DL_SIDEBAR = -0.026;
const RAMP_DL_SURFACE_RAISED = 0.027;
const RAMP_DL_CARD = 0.047;
const RAMP_DL_POPOVER = 0.087;
const SURFACE_RAMP_DELTAS: ReadonlyArray<readonly [name: string, deltaL: number]> = [
  ["--color-sidebar", RAMP_DL_SIDEBAR],
  ["--color-surface-raised", RAMP_DL_SURFACE_RAISED],
  ["--color-card", RAMP_DL_CARD],
  ["--color-popover", RAMP_DL_POPOVER],
];

// Contrast-safe FOREGROUND derivation (readability floor — a foreground is NEVER picked, always derived
// from the surface it sits on). Via relative-color-syntax: L flips light↔dark around a pivot with a steep
// step, so any surface lighter than the pivot gets near-black text and any darker gets near-white — "set
// everything white" is physically unable to produce invisible text. Chroma 0 = neutral text, hue kept for
// a faint warmth. min/max keep it off pure black/white (matches the design's off-white/near-black).
const FG_PIVOT_L = 0.62; // surfaces above this L read as "light" → dark text
const FG_STEEPNESS = 1000; // razor-thin transition band around the pivot
const FG_L_MIN = 0.22; // darkest derived text (near-black, on light surfaces)
const FG_L_MAX = 0.96; // lightest derived text (off-white, on dark surfaces)
// The contrast lightness expression (light surface → low L, dark surface → high L), shared by the
// foreground (opaque) and the derived border (low-alpha hairline).
const CONTRAST_L = `clamp(${FG_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${FG_L_MAX})`;
const BORDER_ALPHA = 0.14; // a subtle hairline — visible on either polarity, never a hard line
/** A contrast-safe foreground for text sitting on `surface` (any validated color) — browser-computed. */
function foregroundOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h)`;
}
/** A subtle contrast border DERIVED from `surface` (the foreground contrast tone at low alpha). */
function borderOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h / ${BORDER_ALPHA})`;
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
  put("--color-speaker", t.speaker);
  put("--color-dialogue", t.dialogueColor);
  put("--color-narration", t.narrationColor);
  put("--color-prose-body", t.bodyColor);
  // Bubbles: the picker sets each bubble's BG; the FG is DERIVED from that bg for contrast (never picked),
  // so a light bubble bg always gets dark text. (Any `.fg` the override carries is intentionally ignored.)
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
    // The base surface (already isSafeColor-validated) + the derived neutral ramp + the derived neutral
    // foregrounds. Relative-color-syntax (`oklch(from <base> calc(l ± Δ) c h)`) keeps the derivation
    // portable (any input format) and the stored override small (it carries only `background`). A seed
    // palette's [data-theme] block overrides these with its hand-tuned values; a custom theme derives them
    // here so its whole chrome — surfaces AND text — tracks the one base surface color coherently + legibly.
    vars["--color-background"] = t.background;
    for (const [name, deltaL] of SURFACE_RAMP_DELTAS) {
      vars[name] = `oklch(from ${t.background} calc(l + ${deltaL}) c h)`;
    }
    const fg = foregroundOn(t.background);
    vars["--color-foreground"] = fg;
    vars["--color-card-foreground"] = fg;
    vars["--color-popover-foreground"] = fg;
    vars["--color-sidebar-foreground"] = fg;
    // The border derives from the base surface too — UNLESS the user set an explicit borderColor (below).
    vars["--color-border"] = borderOn(t.background);
  }
  // An explicit border color WINS over the derived hairline (ST parity).
  put("--color-border", t.borderColor);
  if (t.font !== undefined) {
    vars["--font-sans"] = fontStack(t.font);
  }
  if (t.radius !== undefined) {
    vars["--radius-card"] = `var(--radius-${t.radius})`;
  }
  return {
    vars,
    ...(t.chatStyle === undefined ? {} : { chatStyle: t.chatStyle }),
    ...(t.density === undefined ? {} : { density: t.density }),
  };
}
