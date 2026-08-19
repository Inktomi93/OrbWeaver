// Security boundary for user/character theming: a custom-property VALUE must be parsed + clamped
// here before it reaches the DOM (color must parse as a color, dimension snaps to the token scale,
// font is allowlisted) — anything that fails is dropped, never applied raw.
//
// THE READING-SURFACE DERIVE LAW (#204): every PLATE the transcript paints text on derives from the one
// picked base surface — the neutral ramp (opaque chrome), and `--color-reading-plate` (the over-art text
// backing, base + readingPlate.deltaL at the polarity-derived `readingPlateAlpha`) — and every INK on such a plate comes from
// the SAME palette: derived foregrounds by the pivot flip, and the four author-picked prose inks
// (`speaker`/`dialogueColor`/`narrationColor`/`bodyColor`) through the §7a conditional lightness clamp
// below (pass-through byte-identical when the pairing already clears AA; L re-derived and the ink made
// OPAQUE, hue+chroma kept, when it does not; fail-open when either side carries no statically-readable
// value — a named color, `currentColor`, or any legal spelling neither reader parses).
//
// THE INK'S BASE IS THE CARRIED ONE, ELSE THE AMBIENT ONE (#236). An override that picks inks and NO
// background is the ST-imported population (a 113-116 byte scope payload: three ink vars, no surface),
// and its inks are painted on whatever the ACTIVE APP THEME paints. That surface is statically knowable
// at scope time, so it is threaded in as `ambientBackground` and judged against — the pre-#236 read of
// this arm as "polarity not statically knowable" was false, and it shipped every ST card's dark-authored
// ink raw on the Light seed base at 2.11-2.43:1. The ambient is a JUDGING INPUT ONLY: never emitted,
// never a fallback for the background/ramp/plate/color-scheme, so nothing new crosses this boundary into
// the DOM. `ThemeScope` supplies it — its own picked background to its descendants, the app theme's at
// the shell root — so a nested carried palette re-bases the scopes inside it automatically. The plate is NOT
// `--color-backdrop` (the polarity-FIXED dimming smoke behind modals/dismiss/wallpaper-dim): one token
// serving both jobs is exactly how #204 happened — a light palette's dark inks landed on the app's fixed
// dark smoke. A token names ONE polarity semantic.
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import { THEME_DERIVATION as KIT_THEME_DERIVATION, oklabToOklch, proseInkLightness, readingPlateAlpha, srgbToOklch } from "@orb/kit/theme-derivation";
import { z } from "zod";
import { isSafeColor } from "#lib";

/** Fonts a user may pick — an allowlist; anything else is dropped. */
export const THEME_FONT_ALLOWLIST = ["Geist", "ui-sans-serif", "ui-serif", "ui-monospace", "Georgia", "Times New Roman", "Iowan Old Style"] as const;
type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

// Exported for the contracts↔ui structural pairing test — must stay byte-identical to the wire twin.
// No chatStyle axis: a theme/card cannot force a message-row anatomy (TD/O-4). The row skin reads the
// viewer's own `appearance.chatStyle` setting, whose vocabulary is `@orb/contracts/theme`'s
// THEME_CHAT_STYLES — nothing here ever stamped a `data-chat-style` any selector read.
export const THEME_SCOPE_DENSITIES = ["comfortable", "compact"] as const;
export const THEME_SCOPE_RADII = ["base", "control", "card", "full"] as const;
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
  density: z.enum(DENSITIES).optional(),
});
export type ThemeScopeTokens = z.infer<typeof themeScopeTokensSchema>;

/**
 * The clamped output: a CSS custom-property map safe to spread into `style` (only `--*` keys,
 * only validated values) plus the non-custom-property axes. `density` maps to a `data-*` attribute;
 * `colorScheme` maps to the `color-scheme` CSS property (NOT a `--*` var, so it stays OFF the vars
 * emit surface) — see the `colorSchemeFor` derivation for why it rides this struct.
 */
export interface ClampedTheme {
  readonly vars: Readonly<Record<string, string>>;
  readonly density?: (typeof DENSITIES)[number];
  readonly colorScheme?: "light" | "dark";
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
  // The over-art READING PLATE (#204): base + readingPlate.deltaL, carrying the polarity-derived plate
  // alpha (#217) — the one ramp member with its own alpha, because it composites over wallpaper art.
  // Never `--color-backdrop`.
  "--color-reading-plate",
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
const RAMP_DL_SIDEBAR = KIT_THEME_DERIVATION.ramp.sidebar;
const RAMP_DL_SURFACE_RAISED = KIT_THEME_DERIVATION.ramp.surfaceRaised;
const RAMP_DL_CARD = KIT_THEME_DERIVATION.ramp.card;
const RAMP_DL_POPOVER = KIT_THEME_DERIVATION.ramp.popover;
const RAMP_DL_ACCENT = KIT_THEME_DERIVATION.ramp.accent;
const RAMP_DL_SIDEBAR_ACCENT = KIT_THEME_DERIVATION.ramp.sidebarAccent;
const RAMP_DL_SECONDARY = KIT_THEME_DERIVATION.ramp.secondary;
const RAMP_DL_MUTED = KIT_THEME_DERIVATION.ramp.muted;
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
const FG_PIVOT_L = KIT_THEME_DERIVATION.fgPivotL;
const FG_STEEPNESS = KIT_THEME_DERIVATION.fgSteepness;
const FG_L_MIN = KIT_THEME_DERIVATION.fgLMin;
const FG_L_MAX = KIT_THEME_DERIVATION.fgLMax;
const CONTRAST_L = `clamp(${FG_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${FG_L_MAX})`;
const BORDER_ALPHA = KIT_THEME_DERIVATION.borderAlpha;
const INPUT_ALPHA = KIT_THEME_DERIVATION.inputAlpha;
// Muted foreground: same pivot flip, softer band, tuned to clear WCAG AA (>=4.5:1) against the
// derived input fill on both light and dark bases.
const MUTED_L_MIN = KIT_THEME_DERIVATION.mutedLMin;
const MUTED_L_MAX = KIT_THEME_DERIVATION.mutedLMax;
const MUTED_CONTRAST_L = `clamp(${MUTED_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${MUTED_L_MAX})`;
/**
 * The numeric derivation constants, exported so the seed-palette-contrast test recomputes the
 * derived colors independently and proves every pairing clears WCAG AA against the real constants.
 *
 * ONE HOME, in `@orb/kit/theme-derivation` (2026-08-08). The numbers moved DOWN the cake because a second
 * consumer appeared that `@orb/ui` cannot reach and that cannot reach `@orb/ui`: the SillyTavern theme
 * importer (`@orb/server` `domain/import/substrate/theme.ts`) must PREDICT this derivation in node to decide
 * whether a foreign palette converts safely — a base surface whose derived pairs would not clear WCAG AA is
 * refused rather than imported. This alias keeps every existing consumer's name (`THEME_DERIVATION` off the
 * clamp) while the values have exactly one declaration.
 */
export const THEME_DERIVATION = KIT_THEME_DERIVATION;

// Strict parse of an `oklch(L C H[ / A])` literal — the form the theme editor emits. L (and A) may be a
// 0–1 number OR a percentage. Anything else (a named color, rgb()/hsl(), a var()) returns null: the
// polarity is not STATICALLY knowable, so the caller must fail open, never guess.
const OKLCH_RE = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
const PERCENT_DIVISOR = 100;
interface ParsedOklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}
function unitOrPercent(raw: string): number {
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / PERCENT_DIVISOR : Number(raw);
}
function parseOklch(color: string): ParsedOklch | null {
  const m = OKLCH_RE.exec(color.trim());
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return null;
  }
  const l = unitOrPercent(m[1]);
  const c = Number(m[2]);
  const h = Number(m[3]);
  const alpha = m[4] === undefined ? 1 : unitOrPercent(m[4]);
  return Number.isFinite(l) && Number.isFinite(c) && Number.isFinite(h) && Number.isFinite(alpha) ? { l, c, h, alpha } : null;
}
/** Any statically-readable color → OKLCH+alpha: the OKL literal forms (`oklch()`/`oklab()`, read here
 *  because kit owns only the lab→lch math), else a NUMERIC CSS form (hex/rgb()/hsl(), via kit's parser +
 *  the sRGB→OKLCH inverse — #204: an imported theme's hex/hsl ink is JUDGED, not failed-open on spelling).
 *  What stays null is a value with no readable static form — a named color, `currentColor` — plus the
 *  legal-but-unread spelling MEASURED to survive `isSafeColor` and reach here: modern unitless
 *  `hsl(30 40 20)` (kit's hsl reader requires the `%`). Those fail OPEN (pass-through, the pre-#204
 *  behaviour) — the safe direction, never a guessed polarity. Note the OTHER exotic spellings never get
 *  this far: `isSafeColor` drops a `deg`/negative hue inside `okl*()` and a negative hue in `hsl()`
 *  outright (probed 2026-08-18) — "named colors are the only fail-open" was wrong in both directions. */
function toOklch(color: string): ParsedOklch | null {
  const literal = parseOklch(color) ?? parseOklab(color);
  if (literal !== null) {
    return literal;
  }
  const css = parseCssColorToSrgb(color);
  if (css === null) {
    return null;
  }
  const o = srgbToOklch({ r: css.r, g: css.g, b: css.b });
  return { l: o.l, c: o.c, h: o.h, alpha: css.alpha };
}
// `oklab(L a b[ / A])` — the OTHER `isSafeColor`-legal OKL form. L (and A) may be a 0–1 number or a
// percentage; a/b are signed. Read here rather than in kit's sRGB parser for the same reason the oklch
// literal is: the OKL readers live with their consumer, and kit owns only the lab→lch math.
const OKLAB_RE = /^oklab\(\s*([\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
function parseOklab(color: string): ParsedOklch | null {
  const m = OKLAB_RE.exec(color.trim());
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return null;
  }
  const { l, c, h } = oklabToOklch(unitOrPercent(m[1]), Number(m[2]), Number(m[3]));
  const alpha = m[4] === undefined ? 1 : unitOrPercent(m[4]);
  return Number.isFinite(l) && Number.isFinite(c) && Number.isFinite(h) && Number.isFinite(alpha) ? { l, c, h, alpha } : null;
}
function parseOklchL(color: string): number | null {
  const parsed = toOklch(color);
  return parsed === null ? null : parsed.l;
}

/**
 * The `color-scheme` for a user-picked base surface, derived from its OKLCH lightness. This drives two
 * things a custom theme otherwise gets WRONG: (1) the light-dark() intent tokens resolve their correct
 * arm (a custom LIGHT theme needs the light arms, or intent text renders in its dark-arm tone and goes
 * illegible on the light surface), and (2) native controls/scrollbars match the surface polarity.
 *
 * The pivot MUST be `FG_PIVOT_L` — the SAME threshold the derived foreground flips on — so scheme
 * polarity and text polarity can never disagree: a surface lighter than the pivot already gets
 * near-black text (a LIGHT surface ⇒ "light"), darker gets near-white (⇒ "dark"). Boundary: strictly
 * ABOVE the pivot is light, so L of exactly 0.62 resolves "dark" (the pivot itself yields near-black
 * text but is treated as the dark arm's ceiling, matching the foreground clamp's `(pivot - l)` sign)
 * and one step over (0.63) flips to light. Non-oklch bases omit the scheme (null) so it inherits — we
 * never guess a polarity we can't statically read.
 */
function colorSchemeFor(background: string): "light" | "dark" | null {
  const l = parseOklchL(background);
  if (l === null) {
    return null;
  }
  return l > FG_PIVOT_L ? "light" : "dark";
}

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
/** An unjudgeable base gets an OPAQUE plate — see {@link readingPlateOn}. */
const UNJUDGEABLE_PLATE_ALPHA = 1;
/**
 * The over-art reading plate for a picked base: the same one-base L shift the ramp rides, but carrying
 * its own alpha (it composites over wallpaper art), so it is spelled here rather than in the alphaless
 * ramp loop.
 *
 * The ALPHA is polarity-aware and DERIVED IN NODE (#217, `readingPlateAlpha` — the algebra and the
 * dark-arm owner ruling live on that function): a LIGHT plate's composite over DARK art is the failing
 * case (the same ink measured 3.48:1 and 4.94:1 in one room at two scroll positions), so a light base
 * gets the alpha that keeps the reference ink at AA over worst-case art while a dark base keeps the
 * measured 0.65 floor. It is the one derived number the browser CANNOT compute for us — relative-colour
 * syntax has no contrast operator — so it lands as a literal, judged off the parsed base.
 *
 * A base neither reader resolves (`base === null`: a named colour, modern unitless `hsl()`) cannot be
 * judged at all, so it gets an OPAQUE plate. Failing open on POLARITY is the safe direction
 * (`colorSchemeFor`); failing open on the READING FLOOR would ship the #217 defect on exactly the
 * palettes nothing can prove. Opacity costs the art, never the reader.
 */
function readingPlateOn(background: string, base: ParsedOklch | null): string {
  const alpha = base === null ? UNJUDGEABLE_PLATE_ALPHA : readingPlateAlpha({ l: base.l, c: base.c, h: base.h });
  return `oklch(from ${background} calc(l + ${KIT_THEME_DERIVATION.readingPlate.deltaL}) c h / ${alpha})`;
}

/**
 * ONE author-picked prose ink, judged against the base surface it will be painted on (`null` ⇒ nothing
 * statically readable to judge against ⇒ fail open, the pre-#204 pass-through).
 *
 * Relative-color re-derivation: L replaced, the author's c/h kept — and the alpha slot spelled
 * EXPLICITLY OPAQUE. Relative-color syntax defaults the omitted alpha to the ORIGIN's, so a translucent
 * failing ink used to be re-composited at the author's alpha and STILL failed AA (measured 2.89:1 on
 * `oklch(0.75 0.05 60 / 0.35)` over `oklch(0.158 0.006 60)`) — and re-judging that output returned the
 * same L: a fixed point that never passes (stickler F1, 2026-08-18).
 *
 * WHY OPAQUE rather than the minimal alpha that would just clear AA: this arm IS the fallback to the
 * house "a foreground is derived, never picked" derivation, and every other derived foreground in the
 * system is opaque; a minimal alpha would sit exactly ON the 4.5 boundary with zero margin, while the
 * judge measures against the BASE as a proxy for the surface actually painted (over art the ink lands on
 * `--color-reading-plate` — base+deltaL at alpha, so real art bleeds through and moves the backing).
 * Opaque inherits the same margin every derived foreground has; translucency is the author's intent only
 * while their pick is legible, which the pass-through arm preserves byte-identically.
 */
function proseInkOn(picked: string | undefined, base: ParsedOklch | null): string | undefined {
  if (picked === undefined || base === null) {
    return picked;
  }
  const ink = toOklch(picked);
  if (ink === null) {
    return picked;
  }
  const clampedL = proseInkLightness({ l: ink.l, c: ink.c, h: ink.h }, ink.alpha, { l: base.l, c: base.c, h: base.h });
  return clampedL === null ? picked : `oklch(from ${picked} ${clampedL} c h / 1)`;
}

/** The base the §7a ink clamp judges against: the CARRIED background, else the AMBIENT one (#236). */
function inkBaseFor(carried: string | undefined, ambient: string | undefined): ParsedOklch | null {
  const named = carried ?? ambient;
  return named === undefined ? null : toOklch(named);
}

/**
 * Parse + clamp raw override tokens into a safe custom-property map. Unknown keys are stripped
 * (schema), per-field failures are dropped (a bad `accent` leaves `--color-primary` inherited), and
 * NO value reaches the output without passing `isSafeColor` / an enum / the font allowlist.
 *
 * `ambientBackground` is the base surface this scope's output will actually be PAINTED ON when the
 * override carries none of its own — the enclosing scope's picked background, or the active app
 * theme's (#236, threaded by `ThemeScope`). It is a JUDGING INPUT ONLY: it is parsed to numbers for
 * the §7a ink clamp and never emitted, never a fallback for `--color-background`, the surface ramp,
 * the reading plate or `colorScheme` — so the clamp stays a one-way boundary and an ambient value can
 * carry nothing into the DOM. A CARRIED background always wins outright (including when it is one
 * neither reader resolves: the card DID pick a surface, and an unjudgeable pick fails OPEN rather than
 * being judged against a surface it does not sit on).
 */
export function clampThemeTokens(raw: unknown, ambientBackground?: string): ClampedTheme {
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
  // The §7a prose-ink clamp (#204, see the header law): the four author-picked inks are judged against
  // the BASE surface they will be painted on — every reading plate now derives from it, so
  // base-legibility is plate-legibility. A sensible pairing passes through BYTE-IDENTICAL; a failing ink
  // keeps its hue and chroma and gets the derived lightness at full opacity; a value neither reader
  // resolves on either side ⇒ fail open (polarity not statically knowable — `colorSchemeFor`'s rule).
  //
  // THE BASE IS THE CARRIED ONE, ELSE THE AMBIENT ONE (#236). An override that picks inks and NO
  // background does not escape the judgement — it lands on the surface the app theme paints, which the
  // caller knows statically. The pre-#236 clamp read that arm as "polarity not statically knowable" and
  // failed open, which is what put every ST-imported card's dark-authored inks raw on the Light seed's
  // `oklch(0.98 0.004 75)` at 2.11-2.43:1 (4/4 rooms probed, 67 desktop P1s). The premise was false: no
  // carried background is precisely the case where the composed surface IS knowable. The residual
  // fail-open (neither side statically readable, or nothing named the ambient) stands unchanged.
  const carriedBase = t.background === undefined ? null : toOklch(t.background);
  const inkBase = inkBaseFor(t.background, ambientBackground);
  put("--color-speaker", proseInkOn(t.speaker, inkBase));
  put("--color-dialogue", proseInkOn(t.dialogueColor, inkBase));
  put("--color-narration", proseInkOn(t.narrationColor, inkBase));
  put("--color-prose-body", proseInkOn(t.bodyColor, inkBase));
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
    // The plate derives from the CARRIED base only — never the ambient one (#236): this branch runs
    // only when a background IS carried, and its alpha must answer the art behind THIS scope's surface.
    vars["--color-reading-plate"] = readingPlateOn(t.background, carriedBase);
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
  // Derived from the picked base surface's polarity (never an input field) — drives the light-dark()
  // intent arm + native controls. Omitted for a non-oklch base (fail open to the inherited scheme).
  const colorScheme = t.background === undefined ? null : colorSchemeFor(t.background);
  return {
    vars,
    ...(t.density === undefined ? {} : { density: t.density }),
    ...(colorScheme === null ? {} : { colorScheme }),
  };
}
