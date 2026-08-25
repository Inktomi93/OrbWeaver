// Security boundary for user/character theming: a custom-property VALUE must be parsed + clamped
// here before it reaches the DOM (color must parse as a color, dimension snaps to the token scale,
// font is allowlisted) — anything that fails is dropped, never applied raw.
//
// THE FILE OWNS THE POLICY, NOT THE SPELLINGS: what a picked base DERIVES (the neutral ramp, the
// foregrounds, the plate/band, the #243 elevation ingredients) lives in `derive-vars.ts`, and the colour
// READERS live in `color-parse.ts` — the same seam, cut twice, so this stays the boundary decision.
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
import { accentFillLightness, derivedForegroundLightness, THEME_DERIVATION as KIT_THEME_DERIVATION, proseInkLightness } from "@orb/kit/theme-derivation";
import { z } from "zod";
import { isSafeColor } from "#lib";
import type { ParsedOklch } from "./color-parse.ts";
import { parseOklchL, toOklch } from "./color-parse.ts";
import { foregroundOn, surfaceVarsOn } from "./derive-vars.ts";

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
  /**
   * The VALIDATED accent this scope paints with — its own picked one if it survived the schema, else the
   * ambient it was handed (#692). It rides the struct rather than `vars` for `colorScheme`'s reason: it is
   * not a custom property, and it must stay OFF the emit surface.
   *
   * It is the accent SOURCE, never the emitted `--color-primary`: a descendant that carries its own
   * background must judge the author's original pick against ITS OWN derived card, not against a
   * correction made for a different surface. (It is also the only form a descendant can read — the
   * emitted fill is relative-colour syntax, which no static reader resolves.)
   */
  readonly accentSource?: string;
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
  // …and its OPAQUE sibling, the sticky attribution BAND (#241): the SAME derived colour at alpha 1, so
  // the band and the prose plate under it can never step apart. Emitted rather than left to the base
  // theme because it backs the CARRIED palette's own prose — the #204 two-polarity paragraph.
  "--color-reading-band",
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
  // The five ELEVATION INGREDIENTS of `--shadow-overlay` / `--shadow-cta` (#243, closing #232's recorded
  // residual). Derived from the picked base's POLARITY, never picked: a custom light theme used to
  // inherit the base palette's dark smoke (a 1.00:1 white ring, a near-black halo). They are colours
  // rather than the composite because Tailwind v4 inlines a `--shadow-*` @theme value into its utility at
  // build time — only a var() ingredient survives that and resolves in scope.
  "--color-shadow-hairline",
  "--color-shadow-highlight",
  "--color-shadow-ambient-near",
  "--color-shadow-ambient-far",
  "--color-shadow-cta-highlight",
  "--font-sans",
  "--radius-card",
] as const;

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
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const THEME_DERIVATION = KIT_THEME_DERIVATION;

/**
 * The `color-scheme` for a user-picked base surface, derived from its OKLCH lightness. This drives two
 * things a custom theme otherwise gets WRONG: (1) the light-dark() intent tokens resolve their correct
 * arm (a custom LIGHT theme needs the light arms, or intent text renders in its dark-arm tone and goes
 * illegible on the light surface), and (2) native controls/scrollbars match the surface polarity.
 *
 * The pivot MUST be `THEME_DERIVATION.fgPivotL` — the SAME threshold the derived foreground flips on
 * (`derive-vars.ts`) and the elevation arm flips on (`shadowIngredients`, #243) — so scheme
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
  return l > KIT_THEME_DERIVATION.fgPivotL ? "light" : "dark";
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

/** What a scope emits for the accent: the fill `--color-primary`/`--color-ring` take, and the foreground
 *  derived off it. One struct because the two can never be decided apart — a re-derived fill with an
 *  inherited foreground is the invisible-label defect `put("--color-primary-foreground", …)` exists to
 *  prevent. */
interface AccentEmission {
  readonly fill: string;
  readonly foreground: string;
}

/**
 * THE ACCENT A SCOPE PAINTS WITH, judged against the CARD its graphics land on (#692) — the §7a ink
 * clamp's shape for the one PICKED token that is a FILL rather than an ink (`accentFillLightness` states
 * the algebra and the motivating measurement: Hearth's accent inherited into a light-carried room paints
 * the arc meter's VALUE arc at 2.5858:1, under WCAG 1.4.11's 3:1).
 *
 * THE SOURCE IS THE PICKED ACCENT, ELSE THE AMBIENT ONE — the #236 move, one token over. A carried
 * palette that picks a background and no accent does not escape the judgement: `--color-primary` is not
 * derived from the base, so that scope INHERITS the app theme's accent through the cascade, and which
 * accent it inherits is statically knowable at scope time (`ThemeScope` threads it, the shell resolves it
 * from the active theme). The ambient is a JUDGING INPUT: when it clears, this returns `undefined` and
 * NOTHING is emitted, so the cascade stands exactly as it did — an ambient value can carry nothing into
 * the DOM on its own.
 *
 * IT ONLY RUNS WHERE A BACKGROUND IS CARRIED (`base === null` ⇒ pass-through): with no carried base there
 * is no derived card to judge against, and the accent lands on the app theme's own chrome, whose
 * coherence `palette-contrast.suite.test.ts` already floors.
 *
 * The re-derived fill is spelled OPAQUE for the same reason `proseInkOn` is: relative-colour syntax
 * inherits the ORIGIN's alpha, and re-judging a translucent output is a fixed point that never passes.
 * The foreground is computed SINGLE-LEVEL off the same origin at the corrected lightness rather than
 * nested off the emitted fill — the shape every derived token in `derive-vars.ts` keeps.
 */
function accentEmissionOn(picked: string | undefined, ambient: string | undefined, base: ParsedOklch | null): AccentEmission | undefined {
  const passThrough = picked === undefined ? undefined : { fill: picked, foreground: foregroundOn(picked) };
  const source = picked ?? ambient;
  if (source === undefined || base === null) {
    return passThrough;
  }
  const accent = toOklch(source);
  if (accent === null) {
    return passThrough;
  }
  const clampedL = accentFillLightness({ l: accent.l, c: accent.c, h: accent.h }, accent.alpha, { l: base.l, c: base.c, h: base.h });
  if (clampedL === null) {
    return passThrough;
  }
  return {
    fill: `oklch(from ${source} ${clampedL} c h / 1)`,
    foreground: `oklch(from ${source} ${derivedForegroundLightness(clampedL)} 0 h / 1)`,
  };
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
export function clampThemeTokens(raw: unknown, ambientBackground?: string, ambientAccent?: string): ClampedTheme {
  const parsed = themeScopeTokensSchema.safeParse(raw);
  const t: ThemeScopeTokens = parsed.success ? parsed.data : {};
  const vars: Record<string, string> = {};
  const put = (name: string, value: string | undefined): void => {
    if (value !== undefined) {
      vars[name] = value;
    }
  };
  const carriedBase = t.background === undefined ? null : toOklch(t.background);
  // The accent is judged against the CARD a carried base derives (#692) — see `accentEmissionOn`. With no
  // carried background, or when the accent already clears, this is the pre-#692 pass-through: the picked
  // value byte-identical, or nothing at all.
  const accent = accentEmissionOn(t.accent, ambientAccent, carriedBase);
  put("--color-primary", accent?.fill);
  put("--color-ring", accent?.fill);
  // The accent's readable foreground derives off the accent this scope actually PAINTS with, so a dark
  // accent + static light text can never go invisible.
  put("--color-primary-foreground", accent?.foreground);
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
    Object.assign(vars, surfaceVarsOn(t.background, carriedBase));
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
  const accentSource = t.accent ?? ambientAccent;
  return {
    vars,
    ...(t.density === undefined ? {} : { density: t.density }),
    ...(colorScheme === null ? {} : { colorScheme }),
    ...(accentSource === undefined ? {} : { accentSource }),
  };
}
