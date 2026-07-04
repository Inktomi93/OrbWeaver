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
