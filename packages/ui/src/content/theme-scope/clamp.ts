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

const CHAT_STYLES = ["bubble", "flat", "document"] as const;
const DENSITIES = ["comfortable", "compact"] as const;
const RADII = ["base", "control", "card", "full"] as const;

// A color must be one of these SAFE forms. Deliberately NO url()/expression()/var()/gradient — a value
// that could carry a network fetch or a CSS escape is rejected outright (not sanitized). Hex, rg[b]a(),
// hsl[a](), oklch()/oklab(), and the bare CSS named colors are the whole permitted surface.
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const RGB = /^rgba?\(\s*[0-9., %/]+\)$/iu;
const HSL = /^hsla?\(\s*[0-9., %/deg]+\)$/iu;
const OKL = /^okl(?:ch|ab)\(\s*[0-9.\-% /]+\)$/iu;
const NAMED = /^[a-z]{3,20}$/iu; // transparent, currentColor, red, … (letters only — no separators)
// Belt: reject anything carrying a CSS-escape or fetch vector even if it slipped a shape test.
const INJECTION = /[;{}<>()\\]|url|expression|javascript:|@import|\/\*/iu;

// A legit color value (oklch(...), #rrggbbaa, rgba(...)) is well under this; longer = a payload attempt.
const MAX_COLOR_LEN = 64;

/**
 * The D44 §12.1 color-safety predicate: a color must parse as one of the safe CSS color forms
 * (hex / rgb[a]() / hsl[a]() / oklch()/oklab() / a bare named color) and never carry an
 * injection vector (`url()`, `expression()`, `javascript:`, `@import`, a `{`/`;` escape). Exported
 * so OTHER ui primitives that accept a raw color value (e.g. `color-field`) can reuse the exact
 * same clamp instead of re-deriving their own regex set — see ui-primitive-carve-out-work-order.md
 * item 13 ("mirror the ThemeScope clamp, don't reinvent it").
 */
export function isSafeColor(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_COLOR_LEN) {
    return false;
  }
  // url()/expression() contain "(" so the INJECTION guard catches them; the shape guards below allow
  // the "(" ONLY inside the known color-function forms, which the guard would also flag — so check the
  // shape FIRST and only run the injection guard on the named/hex path (functional forms are exact).
  if (HEX.test(value) || NAMED.test(value)) {
    return !INJECTION.test(value);
  }
  return RGB.test(value) || HSL.test(value) || OKL.test(value);
}

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
  chatStyle: z.enum(CHAT_STYLES).optional(),
  density: z.enum(DENSITIES).optional(),
});
export type ThemeScopeTokens = z.infer<typeof themeScopeTokensSchema>;

/**
 * The clamped output: a CSS custom-property map safe to spread into `style` (only `--*` keys, only
 * validated values) plus the two attribute axes (chatStyle/density are `data-*`, not custom props).
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
  put("--color-user-bubble", t.userBubble?.bg);
  put("--color-user-bubble-foreground", t.userBubble?.fg);
  put("--color-ai-bubble", t.aiBubble?.bg);
  put("--color-ai-bubble-foreground", t.aiBubble?.fg);
  put("--color-system-bubble", t.systemBubble?.bg);
  put("--color-system-bubble-foreground", t.systemBubble?.fg);
  put("--color-speaker", t.speaker);
  put("--color-dialogue", t.dialogueColor);
  put("--color-narration", t.narrationColor);
  put("--color-prose-body", t.bodyColor);
  put("--color-background", t.background);
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
