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
// OPAQUE, hue+chroma kept, when it does not; fail-open only when neither a standards-readable color nor
// an ambient backing exists (`currentColor` or an invalid safe bare word in a provider-less mount).
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

import { isDeterministicColor, isSafeColor } from "@orb/kit/safe-color";
import {
  accentFillLightness,
  derivedForegroundLightness,
  THEME_DERIVATION as KIT_THEME_DERIVATION,
  proseInkLightness,
  surfacePolarity,
} from "@orb/kit/theme-derivation";
import { z } from "zod";
import type { ParsedOklch } from "./color-parse.ts";
import { compositedBase, serializeOpaqueOklch, toOklch } from "./color-parse.ts";
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

const colorToken = z.string().refine(isSafeColor).optional().catch(undefined);
const deterministicColorToken = z.string().refine(isDeterministicColor).optional().catch(undefined);
// The bg is a FILL with a foreground derived from it; .fg remains in the paired wire shape but is not
// painted. Inherited/direct colors below deliberately retain the broader safe-color contract.
const bubble = z.object({ bg: deterministicColorToken, fg: colorToken }).optional().catch(undefined);

/** The ui-local override shape callers pass (loose — every field optional; failures drop per-field). */
export const themeScopeTokensSchema = z.object({
  // These are derivation origins: accent gets a foreground/contrast correction, background gets the
  // whole surface/chart ramp. Contextual/system/CSS-wide colors cannot stand in for authored pixels.
  accent: deterministicColorToken,
  userBubble: bubble,
  aiBubble: bubble,
  systemBubble: bubble,
  speaker: colorToken,
  dialogueColor: colorToken,
  narrationColor: colorToken,
  bodyColor: colorToken,
  font: z.enum(THEME_FONT_ALLOWLIST).optional().catch(undefined),
  radius: z.enum(RADII).optional().catch(undefined),
  background: deterministicColorToken,
  borderColor: colorToken,
  density: z.enum(DENSITIES).optional().catch(undefined),
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
   * THE SCOPE'S INHERITED INK (#2424). A carried palette that paints its own surface must also RESTATE
   * `color`, or every element inside it that takes its ink by INHERITANCE keeps whatever the document
   * resolved above the scope. `.shell-grid` resolves `color: var(--color-foreground)` ABOVE every scope
   * (message-row-backing.ts's #204 note states the same fact from the prose side), so under a LIGHT app
   * theme a card-themed room's composer painted the ROOT's light ink on the SCOPE's dark surface:
   * measured `(34.9,30.2,26.6)` on `(22,17,19)` = **1.13:1**, invisible the moment a reader typed.
   *
   * The textarea was the only casualty on that drive because a textarea's VALUE is not a child text node,
   * so nothing in the row's own ink rules reached it — but the leak is the CLASS, not that one element:
   * every future inheriting descendant had the same hole. Emitting `color` closes it at the boundary that
   * already owns the palette, which is why this is not a new token and not a per-consumer class.
   *
   * It rides this struct rather than `vars` for `colorScheme`'s exact reason: it is a REAL CSS property,
   * not a custom property, so it must stay OFF the `--*` emit surface (`THEME_SCOPE_EMIT_VARS`). It is
   * present exactly when the scope emitted `--color-foreground` — i.e. when it CARRIES a background and
   * therefore owns the pairing. A scope with no carried surface emits nothing here and the cascade stands
   * byte-identically, which is what keeps the ink-only (#236) population untouched.
   */
  readonly color?: string;
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
  /** Opaque pixel this scope's authored background paints over its ambient; judging/context only. */
  readonly resolvedBackground?: string;
}

function fontStack(font: ThemeFont): string {
  return font === "Geist" ? "Geist, ui-sans-serif, system-ui, sans-serif" : `${font}, serif`;
}

/**
 * The numeric derivation constants, exported so the seed-palette-contrast test recomputes the
 * derived colors independently and proves every pairing clears WCAG AA against the real constants.
 *
 * ONE HOME, in `@orb/kit/theme-derivation` (2026-08-08). The numbers moved DOWN the cake because a second
 * consumer appeared that `@orb/ui` cannot reach and that cannot reach `@orb/ui`: the SillyTavern importer
 * persists into the same ThemeOverride contract. This alias keeps every existing consumer's name
 * (`THEME_DERIVATION` off the clamp) while the total accepted-base solver has exactly one declaration.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const THEME_DERIVATION = KIT_THEME_DERIVATION;

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
function proseInkOn(picked: string | undefined, base: ParsedOklch | null, absentFallback?: string): string | undefined {
  if (picked === undefined) {
    return absentFallback;
  }
  if (base === null) {
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
  const source = picked ?? ambient;
  if (source === undefined) {
    return;
  }
  const accent = toOklch(source);
  const passThrough = picked === undefined || accent === null ? undefined : { fill: picked, foreground: foregroundOn(picked, accent) };
  if (base === null) {
    return passThrough;
  }
  if (accent === null) {
    return passThrough;
  }
  const clampedL = accentFillLightness({ l: accent.l, c: accent.c, h: accent.h }, accent.alpha, { l: base.l, c: base.c, h: base.h });
  if (clampedL === null) {
    return passThrough;
  }
  return {
    fill: `oklch(from ${source} ${clampedL} c h / 1)`,
    foreground: `oklch(from ${source} ${derivedForegroundLightness({ l: clampedL, c: accent.c, h: accent.h })} 0 h / 1)`,
  };
}

/** The base the §7a ink clamp judges against: the CARRIED background, else the AMBIENT one (#236). */
function inkBaseFor(carried: string | undefined, ambient: string | undefined): ParsedOklch | null {
  if (carried !== undefined) {
    return compositedBase(carried, ambient);
  }
  return ambient === undefined ? null : toOklch(ambient);
}

function derivedOriginFor(background: string, authored: ParsedOklch | null, resolved: ParsedOklch | null): string {
  if (authored !== null && authored.alpha >= 1 && authored.inGamut === true) {
    return background;
  }
  return resolved === null ? background : serializeOpaqueOklch(resolved);
}

function absentProseInkOn(raw: unknown, field: keyof ThemeScopeTokens, background: string | undefined, base: ParsedOklch | null): string | undefined {
  if ((typeof raw === "object" && raw !== null && Object.hasOwn(raw, field)) || background === undefined || base === null) {
    return;
  }
  return foregroundOn(derivedOriginFor(background, toOklch(background), base), base);
}

/**
 * The INHERITED-INK restatement (#2424), gated on the emit that makes it meaningful. `--color-foreground`
 * is emitted only by `surfaceVarsOn` — i.e. only for a CARRIED background — so this is present exactly
 * where the scope owns BOTH halves of the pairing. It reads the EMITTED MAP rather than re-deriving the
 * condition from `t.background`, so the gate and the emit can never disagree.
 *
 * It returns the PARTIAL rather than the value for the same reason every other optional axis on
 * `ClampedTheme` is spread: `exactOptionalPropertyTypes` makes an explicit `color: undefined` a different
 * shape from an absent key, and the absent key is what keeps an ink-only scope byte-identical.
 */
function inheritedInkOn(vars: Readonly<Record<string, string>>): { readonly color?: string } {
  return Object.hasOwn(vars, "--color-foreground") ? { color: "var(--color-foreground)" } : {};
}

/**
 * The `color-scheme` for a user-picked base surface, derived from its OKLCH lightness. This drives two
 * things a custom theme otherwise gets WRONG: (1) the light-dark() intent tokens resolve their correct
 * arm (a custom LIGHT theme needs the light arms, or intent text renders in its dark-arm tone and goes
 * illegible on the light surface), and (2) native controls/scrollbars match the surface polarity.
 *
 * The decision is `surfacePolarity`, the SAME measured black-vs-white contrast comparison the foreground,
 * ramp, elevation and chart derivations use. Every standards-readable spelling is normalized before this
 * decision; only a contextual/invalid value with no ambient omits the scheme rather than guessing.
 */
function colorSchemeFor(base: ParsedOklch | null): "light" | "dark" | null {
  if (base === null) {
    return null;
  }
  return surfacePolarity(base);
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
 * carry nothing into the DOM. A CARRIED background owns the emitted property; its resolved pixel is
 * composited over ambient for judging/derivation. An invalid safe bare word paints nothing and therefore
 * resolves to the ambient surface the browser actually leaves visible.
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
  const carriedBase = t.background === undefined ? null : compositedBase(t.background, ambientBackground);
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
  // keeps its hue and chroma and gets the derived lightness at full opacity; a contextual/invalid value
  // with no readable ambient remains the one honest fail-open arm.
  //
  // THE BASE IS THE CARRIED ONE, ELSE THE AMBIENT ONE (#236). An override that picks inks and NO
  // background does not escape the judgement — it lands on the surface the app theme paints, which the
  // caller knows statically. The pre-#236 clamp read that arm as "polarity not statically knowable" and
  // failed open, which is what put every ST-imported card's dark-authored inks raw on the Light seed's
  // `oklch(0.98 0.004 75)` at 2.11-2.43:1 (4/4 rooms probed, 67 desktop P1s). The premise was false: no
  // carried background is precisely the case where the composed surface IS knowable. The residual
  // provider-less fail-open (neither side statically readable) stands unchanged.
  const inkBase = inkBaseFor(t.background, ambientBackground);
  // A carried base also owns every ABSENT prose pick (#985). Otherwise a legal background-only custom
  // theme inherits all four inks from the outer seed, which can be the opposite polarity. Derive the
  // fallback from the resolved carried pixel; with no carried background there is deliberately no
  // fallback and the cascade remains intact. Explicit picks still take the pass-through/correction arms
  // above byte-for-byte.
  put("--color-speaker", proseInkOn(t.speaker, inkBase, absentProseInkOn(raw, "speaker", t.background, carriedBase)));
  put("--color-dialogue", proseInkOn(t.dialogueColor, inkBase, absentProseInkOn(raw, "dialogueColor", t.background, carriedBase)));
  put("--color-narration", proseInkOn(t.narrationColor, inkBase, absentProseInkOn(raw, "narrationColor", t.background, carriedBase)));
  put("--color-prose-body", proseInkOn(t.bodyColor, inkBase, absentProseInkOn(raw, "bodyColor", t.background, carriedBase)));
  // Bubbles: the picker sets each bubble's bg; the fg is always derived for contrast, never picked.
  const putBubble = (bg: string, bgVar: string, fgVar: string): void => {
    const parsedBubble = toOklch(bg);
    vars[bgVar] = bg;
    if (parsedBubble !== null) {
      vars[fgVar] = foregroundOn(bg, parsedBubble);
    }
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
    const authoredBase = toOklch(t.background);
    const derivedOrigin = derivedOriginFor(t.background, authoredBase, carriedBase);
    Object.assign(vars, surfaceVarsOn(t.background, carriedBase, derivedOrigin));
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
  // Derived from the resolved base pixel's polarity (never an input field) — drives the light-dark()
  // intent arm + native controls. Named/numeric spellings agree because both cross the same parser.
  const colorScheme = colorSchemeFor(carriedBase);
  const accentSource = t.accent ?? ambientAccent;
  const resolvedBackground = carriedBase === null ? undefined : serializeOpaqueOklch(carriedBase);
  return {
    vars,
    ...(t.density === undefined ? {} : { density: t.density }),
    ...(colorScheme === null ? {} : { colorScheme }),
    ...inheritedInkOn(vars),
    ...(accentSource === undefined ? {} : { accentSource }),
    ...(resolvedBackground === undefined ? {} : { resolvedBackground }),
  };
}
