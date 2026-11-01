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
// below (pass-through byte-identical when the pairing clears AA on every reading host; otherwise the least L
// move that clears them, the ink made OPAQUE, hue+chroma kept where they can be, so a pick that clears its page
// moves only as far as the cards and bubbles over that base need; fail-open only when neither a standards-readable
// color nor an ambient backing exists (`currentColor` or an invalid safe bare word in a provider-less mount).
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

import type { MessageRole } from "@orb/kit/message-role";
import { isDeterministicColor, isSafeColor } from "@orb/kit/safe-color";
import type { Oklch } from "@orb/kit/theme-derivation";
import { bubbleInset, carriedReadingHosts, derivedForegroundLightness, proseInkCorrection, surfacePolarity } from "@orb/kit/theme-derivation";
import { z } from "zod";
import type { AmbientScope, BubbleScope, BubbleScopes, PickedFill, PickedFills, ProseInks } from "#lib";
import { PROSE_INK_FIELDS } from "#lib";
import { SEED_THEME_VALUE_SETS, TOKENS } from "#tokens";
import type { ParsedOklch } from "./color-parse.ts";
import { compositedBase, serializeOpaqueOklch, toOklch } from "./color-parse.ts";
import type { CarriedPalette, InputBorderFallback } from "./derive-vars.ts";
import { carriedPaletteOf, inputBorderOn, nestedRingOn, surfaceVarsOn } from "./derive-vars.ts";
import { THEME_OVERRIDE_COLOR_VARS } from "./emit-vars.ts";
import type { CarriedToneScheme } from "./tone-knobs.ts";
import {
  accentInk,
  carriedToneScheme,
  carriedToneSources,
  paintedAccentFill,
  primaryLiteralResets,
  primaryToneMix,
  primaryToneVars,
  solveCarriedToneMix,
  toneHostReset,
  toneLiteralVars,
  toneMixVars,
} from "./tone-knobs.ts";

// Fonts a user may pick — an allowlist; anything else is dropped.
const THEME_FONT_ALLOWLIST = ["Geist", "ui-sans-serif", "ui-serif", "ui-monospace", "Georgia", "Times New Roman", "Iowan Old Style"] as const;
type ThemeFont = (typeof THEME_FONT_ALLOWLIST)[number];

// Keep the contracts↔ui structural pairing byte-identical to the wire twin.
// No chatStyle axis: a theme/card cannot force a message-row anatomy (TD/O-4). The row skin reads the
// viewer's own `appearance.chatStyle` setting, whose vocabulary is `@orb/contracts/theme`'s
// THEME_CHAT_STYLES — nothing here ever stamped a `data-chat-style` any selector read.
const THEME_SCOPE_DENSITIES = ["comfortable", "compact"] as const;
const THEME_SCOPE_RADII = ["base", "control", "card", "full"] as const;
const DENSITIES = THEME_SCOPE_DENSITIES;
const RADII = THEME_SCOPE_RADII;

// Asks only `isSafeColor`; the wire twin (`@orb/contracts/theme`) also asks `isRenderableColor`. Every value the wire keeps
// is kept here (pinned by tests/ui/content/theme-scope/wire-subset-of-render.test.ts). Do not add the parse: this runs
// on every ThemeScope render and a junk word is unreachable from a wire-parsed override.
const colorToken = z.string().refine(isSafeColor).optional().catch(undefined);
const deterministicColorToken = z.string().refine(isDeterministicColor).optional().catch(undefined);
// The bg is a FILL with a foreground derived from it; .fg remains in the paired wire shape but is not
// painted. Inherited/direct colors below deliberately retain the broader safe-color contract.
const bubble = z.object({ bg: deterministicColorToken, fg: colorToken }).optional().catch(undefined);

// The ui-local override shape callers pass (loose — every field optional; failures drop per-field).
const themeScopeTokensSchema = z.object({
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
   * (the over-art reading plates pair their own ink for the same reason), so under a LIGHT app
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
  /** The validated prose inks a nested scope inherits, judging-only like {@link ClampedTheme.accentSource}: they never reach the emit surface as a var of their own. */
  readonly proseInks: ProseInks;
  /** The fill each role paints under this scope, which a nested scope hands on. Judging-only, like {@link ClampedTheme.proseInks}. */
  readonly bubbleFills: PickedFills;
  /** What `MessageBubble` restates on its own box: fill-judged vars never reach this scope's emit surface. */
  readonly bubbleScopes: BubbleScopes;
  /** Opaque pixel this scope's authored background paints over its ambient; judging/context only. */
  readonly resolvedBackground?: string;
  /** Set when no one ink covers the primary fill and its solid steps, so the solve raised the step knobs (D336). */
  readonly toneFallback?: ToneFallback;
  /** Set when the scope's form-control edge could not hold both D159 bounds (the 3:1 floor wins over the focus-ring ceiling), or when an accent-only scope's ring cannot sit above the outer carried edge. */
  readonly inputBorderFallback?: InputBorderFallback;
}

const AMBIENT_PALETTES = ["seed", "carried"] as const;

/**
 * What painted a scope's ambient background: a seed palette's static block, or an outer scope that carried its own
 * background and solved its tone roles there (D336). Only the second gives an accent-only scope a palette to solve on.
 */
export type AmbientPalette = (typeof AMBIENT_PALETTES)[number];

/** What a scope inherits beside its ambient base and accent: who painted that base, and the prose inks picked above it. */
export interface ScopeAmbient extends AmbientScope {
  readonly palette?: AmbientPalette | undefined;
  /** This solve is a box's own palette, so its background is the fill, not a nested card's. */
  readonly asBox?: boolean;
}

/** The D336 primary fallback a scope took: the fill it paints and the hover and active percents the solve raised to. */
export interface ToneFallback {
  readonly accent: string;
  readonly hover: number;
  readonly active: number;
}

/** The fallback stack each pickable font resolves to; the shipped face takes its token's own stack. */
const THEME_FONT_STACKS: ReadonlyMap<ThemeFont, string> = new Map<ThemeFont, string>([
  ["Geist", TOKENS["font.sans"].value],
  ["ui-sans-serif", "ui-sans-serif, system-ui, sans-serif"],
  ["ui-serif", "ui-serif, serif"],
  ["ui-monospace", "ui-monospace, monospace"],
  ["Georgia", "Georgia, serif"],
  ["Times New Roman", "'Times New Roman', serif"],
  ["Iowan Old Style", "'Iowan Old Style', serif"],
]);

/** The allowlist and the map share one key set, so a miss cannot happen; the fallback keeps the type honest. */
function fontStackFor(font: ThemeFont): string {
  return THEME_FONT_STACKS.get(font) ?? font;
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
function proseInkOn(picked: string | undefined, base: ParsedOklch | null, hosts: readonly Oklch[] | undefined, absentFallback?: string): string | undefined {
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
  const fix = proseInkCorrection({ l: ink.l, c: ink.c, h: ink.h }, ink.alpha, { l: base.l, c: base.c, h: base.h }, hosts);
  if (fix === null) {
    return picked;
  }
  return `oklch(from ${picked} ${fix.l} ${fix.c === ink.c ? "c" : fix.c} h / 1)`;
}

/** The surfaces a picked prose ink is judged on with no picked bubble around it: the reading hosts of the base under it, carried or seed. */
function readingHostsOn(inkBase: ParsedOklch | null, seedHosts: readonly Oklch[] | null): readonly Oklch[] {
  if (inkBase === null) {
    return [];
  }
  const base = { l: inkBase.l, c: inkBase.c, h: inkBase.h };
  return seedHosts === null ? carriedReadingHosts(base) : [base, ...seedHosts];
}

/** The token each prose field overrides, read for a seed's static value. */
const PROSE_INK_TOKENS = {
  speaker: "color.speaker",
  dialogueColor: "color.dialogue",
  narrationColor: "color.narration",
  bodyColor: "color.prose-body",
} as const satisfies Record<(typeof PROSE_INK_FIELDS)[number], keyof typeof TOKENS>;

/** A seed's value for a token, read through its base: the root palette's, or the value set that paints that base. `null` when no seed paints it. */
function seedValuesOf(background: string | undefined): ((token: keyof typeof TOKENS) => string) | null {
  if (background === undefined) {
    return null;
  }
  const backgroundVar = TOKENS["color.background"].cssVar;
  const set = Object.values(SEED_THEME_VALUE_SETS).find(({ vars }) => (vars as Readonly<Record<string, string>>)[backgroundVar] === background);
  if (set === undefined && background !== TOKENS["color.background"].value) {
    return null;
  }
  const seeded = set?.vars as Readonly<Record<string, string>> | undefined;
  return (token) => seeded?.[TOKENS[token].cssVar] ?? TOKENS[token].value;
}

/** A seed's inks are static CSS that no scope hands down, so its base names them. */
function seedInksOf(background: string | undefined): ProseInks {
  const seed = seedValuesOf(background);
  return seed === null ? {} : Object.fromEntries(PROSE_INK_FIELDS.map((field) => [field, seed(PROSE_INK_TOKENS[field])]));
}

const SEED_READING_HOSTS = ["color.card", "color.user-bubble", "color.ai-bubble", "color.system-bubble"] as const;

/** The surfaces a pick is read on over a seed: the ones it paints, which its generated block retunes away from the derived ramp. */
function seedReadingHosts(background: string | undefined): readonly Oklch[] | null {
  const seed = seedValuesOf(background);
  return seed === null ? null : SEED_READING_HOSTS.flatMap((token) => toOklch(seed(token)) ?? []);
}

function insideBox(t: ThemeScopeTokens, inside: boolean): ThemeScopeTokens {
  if (!inside) {
    return t;
  }
  const { background: _background, userBubble: _user, aiBubble: _ai, systemBubble: _system, ...held } = t;
  return held;
}

/** What a scope's prose inks are judged over: the base under them, the seed's painted hosts over a seed, or the fill they sit inside. */
interface ProseInkGrounds {
  readonly inkBase: ParsedOklch | null;
  readonly seedHosts: readonly Oklch[] | null;
  readonly inside: ParsedOklch | null;
}

/** The four prose vars a scope writes: its picks judged on their hosts, or on the bubble fill the scope sits inside, and a carried base's ink for each absent pick. */
function proseInkVars(
  raw: unknown,
  t: ThemeScopeTokens,
  carried: CarriedPalette | null,
  { inkBase, seedHosts, inside }: ProseInkGrounds,
): Readonly<Record<string, string>> {
  const hostsOn = (): readonly Oklch[] | undefined => {
    if (inside !== null) {
      return [inside];
    }
    return PROSE_INK_FIELDS.some((field) => t[field] !== undefined) ? readingHostsOn(inkBase, seedHosts) : undefined;
  };
  const hosts = hostsOn();
  const out: Record<string, string> = {};
  for (const field of PROSE_INK_FIELDS) {
    const ink = proseInkOn(t[field], inside ?? inkBase, hosts, absentProseInkOn(raw, field, t.background, carried));
    if (ink !== undefined) {
      out[THEME_OVERRIDE_COLOR_VARS[field]] = ink;
    }
  }
  return out;
}

const THEME_OVERRIDE_FOREGROUND = "--color-foreground";

const BUBBLE_PICKS = [
  ["user", "userBubble"],
  ["system", "systemBubble"],
  ["assistant", "aiBubble"],
] as const satisfies readonly (readonly [MessageRole, keyof ThemeScopeTokens])[];

/** The fill each role paints, as an opaque pixel: this scope's picks over the ones around it. A carried background repaints what those sat on, so it keeps only its own. */
function bubbleFillsOn(t: ThemeScopeTokens, under: string | undefined, ambient: PickedFills): PickedFills {
  const fills: Partial<Record<MessageRole, PickedFill>> = t.background === undefined ? { ...ambient } : {};
  for (const [role, field] of BUBBLE_PICKS) {
    const picked = t[field]?.bg;
    const pixel = picked === undefined ? null : compositedBase(picked, under);
    if (pixel !== null) {
      fills[role] = { pixel: serializeOpaqueOklch(pixel), paint: picked ?? "" };
    }
  }
  return fills;
}

// The solve is a whole palette, and every row of a card's room asks for the same one.
const BOX_SOLVES = new Map<string, ClampedTheme>();
const BOX_SOLVE_LIMIT = 64;

/** A box's links paint the accent as text, so inside it the accent holds the text floor on the fill, not the graphic one a card asks. */
function boxAccentOn(pixel: string, accent: string | undefined): string | undefined {
  const fill = toOklch(pixel);
  const source = accent === undefined ? null : toOklch(accent);
  if (fill === null || source === null) {
    return accent;
  }
  const fix = proseInkCorrection({ l: source.l, c: source.c, h: source.h }, source.alpha, { l: fill.l, c: fill.c, h: fill.h });
  return fix === null ? accent : serializeOpaqueOklch({ l: fix.l, c: fix.c, h: source.h });
}

function boxSolve(pixel: string, inks: ProseInks, ambientAccent: string | undefined): ClampedTheme {
  const accent = boxAccentOn(pixel, ambientAccent);
  const key = JSON.stringify([pixel, inks, accent]);
  const known = BOX_SOLVES.get(key);
  if (known !== undefined) {
    return known;
  }
  const solved = clampThemeTokens({ ...inks, background: pixel }, undefined, accent, { inside: pixel, asBox: true });
  if (BOX_SOLVES.size >= BOX_SOLVE_LIMIT) {
    BOX_SOLVES.clear();
  }
  BOX_SOLVES.set(key, solved);
  return solved;
}

/**
 * The palette each picked fill's box restates: the fill solved as a carried base, so what the box holds reads it as a whole
 * surface, foreground to tone tints. The box is the only surface these hold on: a fill across the crossover from the page
 * admits no ink for both, and a skin with no box never renders one, so the page keeps its own palette. Each prose ink in
 * force is judged on the fill alone. Inside the box the role's fill var is the opaque pixel and its ink the box's foreground.
 */
function bubbleScopesOn(fills: PickedFills, inks: ProseInks, accent: string | undefined): BubbleScopes {
  const scopes: Partial<Record<MessageRole, BubbleScope>> = {};
  for (const [role, field] of BUBBLE_PICKS) {
    const fill = fills[role];
    if (fill !== undefined) {
      const solved = boxSolve(fill.pixel, inks, accent);
      const names = THEME_OVERRIDE_COLOR_VARS[field];
      const ink = solved.vars[THEME_OVERRIDE_FOREGROUND] ?? "";
      scopes[role] = { fill, colorScheme: solved.colorScheme, vars: { ...solved.vars, [names.bg]: fill.pixel, [names.fg]: ink } };
    }
  }
  return scopes;
}

/** Each picked bubble's fill and its derived ink, solved on the pixel it paints, so a translucent fill reads its composite. */
function pickedBubbleVars(t: ThemeScopeTokens, under: string | undefined): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [, field] of BUBBLE_PICKS) {
    const picked = t[field]?.bg;
    if (picked !== undefined) {
      const names = THEME_OVERRIDE_COLOR_VARS[field];
      const pixel = compositedBase(picked, under);
      out[names.bg] = picked;
      if (pixel !== null) {
        out[names.fg] = `oklch(from ${picked} ${bubbleInset(pixel).foreground} 0 h / 1)`;
      }
    }
  }
  return out;
}

/** What a scope emits for the accent: the fill `--color-primary`/`--color-ring` take, and the foreground
 *  derived off it. One struct because the two can never be decided apart — a re-derived fill with an
 *  inherited foreground is the invisible-label defect `put("--color-primary-foreground", …)` exists to
 *  prevent. */
interface AccentEmission {
  readonly fill: string;
  readonly foreground: string;
  /** The fill's opaque pixel, the primary tone's base for the D336 knob solve. */
  readonly painted: Oklch;
  /** Whether one ink covers the fill and its solid steps at the default knobs (`accentInk`). */
  readonly coversSteps: boolean;
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
 * coherence the palette contrast floor already covers.
 *
 * The re-derived fill is spelled OPAQUE for the same reason `proseInkOn` is: relative-colour syntax
 * inherits the ORIGIN's alpha, and re-judging a translucent output is a fixed point that never passes.
 * The foreground is computed SINGLE-LEVEL off the same origin at the corrected lightness rather than
 * nested off the emitted fill — the shape every derived token in `derive-vars.ts` keeps.
 *
 * D336: a carried palette owns its primary and always emits the pixel it judged (`paintedAccentFill`), the
 * authored spelling only when that is the same pixel, so a nested scope never paints an outer correction it did
 * not judge. Its foreground is `accentInk`: one ink over the fill and its solid steps, else the fill's own ink,
 * and the knob solve raises the steps toward the fill until that ink clears them.
 */
function accentEmissionOn(picked: string | undefined, ambient: string | undefined, scheme: CarriedToneScheme | null): AccentEmission | undefined {
  const source = picked ?? ambient;
  const accent = source === undefined ? null : toOklch(source);
  if (source === undefined || accent === null) {
    return;
  }
  if (scheme === null) {
    return picked === undefined
      ? undefined
      : { fill: picked, foreground: `oklch(from ${picked} ${derivedForegroundLightness(accent)} 0 h / 1)`, painted: accent, coversSteps: true };
  }
  const paint = paintedAccentFill(scheme, accent);
  const fill = paint.authored ? source : serializeOpaqueOklch(paint.fill);
  const ink = accentInk(scheme, paint.fill);
  return { fill, foreground: `oklch(from ${fill} ${ink.lightness} 0 h / 1)`, painted: paint.fill, coversSteps: ink.coversSteps };
}

interface AccentAndTones {
  readonly accent: AccentEmission | undefined;
  readonly toneVars: Readonly<Record<string, string>>;
  readonly fallback: ToneFallback | undefined;
  /** The outer edge an accent-only scope could not hold its ring above (D159); a carried scope reports its own edge instead. */
  readonly inputBorderFallback?: InputBorderFallback;
}

/**
 * The accent emission and, under a carried palette, what its `[data-tone]` roles read (D336): the knobs, solved over
 * its ramp, its intent arms and the primary it paints, and each colored tone's literal roles; with no accent at all,
 * primary is left out of both. A scope that paints its own accent over a carried ambient palette solves its primary on
 * that palette; over a seed palette it resets the primary literals.
 */
function accentAndTonesOn(
  picked: string | undefined,
  ambientAccent: string | undefined,
  carried: CarriedPalette | null,
  carriedAmbient: CarriedPalette | null,
): AccentAndTones {
  if (carried === null && picked !== undefined && carriedAmbient !== null) {
    return nestedAccentOn(picked, carriedAmbient);
  }
  const scheme = carried === null ? null : carriedToneScheme(carried);
  const accent = accentEmissionOn(picked, ambientAccent, scheme);
  if (scheme === null) {
    return { accent, toneVars: accent === undefined ? {} : primaryLiteralResets(), fallback: undefined };
  }
  const sources = carriedToneSources(scheme, accent?.painted ?? null);
  const mix = solveCarriedToneMix(scheme, sources);
  const primary = primaryToneMix(mix);
  const fallback = accent === undefined || accent.coversSteps ? undefined : { accent: accent.fill, hover: primary.hover, active: primary.active };
  return { accent, toneVars: { ...toneMixVars(mix), ...toneLiteralVars(scheme, sources), ...toneHostReset() }, fallback };
}

/**
 * An accent-only scope over a carried palette (D336): its primary lands on that palette's ramp, which the outer scope
 * solved for a different accent, so it judges and solves the primary's fill, ink, steps and literals there.
 */
function nestedAccentOn(picked: string, ambient: CarriedPalette): AccentAndTones {
  const scheme = carriedToneScheme(ambient);
  const accent = accentEmissionOn(picked, undefined, scheme);
  if (accent === undefined) {
    return { accent, toneVars: primaryLiteralResets(), fallback: undefined };
  }
  const primary = carriedToneSources(scheme, accent.painted).filter(({ tone }) => tone === "primary");
  const mix = solveCarriedToneMix(scheme, primary);
  const steps = primaryToneMix(mix);
  const fallback = accent.coversSteps ? undefined : { accent: accent.fill, hover: steps.hover, active: steps.active };
  // The ring follows this scope's accent, so it is held above the outer scope's edge again (D159); the tone vars land after the fill's ring.
  const ring = nestedRingOn(ambient, accent.painted);
  return {
    accent,
    toneVars: { ...primaryToneVars(scheme, mix, primary), ...ring.vars },
    fallback,
    ...(ring.fallback === undefined ? {} : { inputBorderFallback: ring.fallback }),
  };
}

/**
 * The palette an accent-only scope solves its primary on: the ambient, when an outer carried scope painted it. Only an
 * accent-only scope reads it, so every other scope skips the ink solves.
 */
function carriedAmbientOf(t: ThemeScopeTokens, ambientBackground: string | undefined, ambientPalette: AmbientPalette): CarriedPalette | null {
  const accentOnly = t.background === undefined && t.accent !== undefined;
  return accentOnly && ambientPalette === "carried" && ambientBackground !== undefined ? carriedPaletteOf(toOklch(ambientBackground)) : null;
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

// An absent prose ink takes the page ink, solved over the page, raised and card family, because a card is a reading host too.
function absentProseInkOn(raw: unknown, field: keyof ThemeScopeTokens, background: string | undefined, carried: CarriedPalette | null): string | undefined {
  if ((typeof raw === "object" && raw !== null && Object.hasOwn(raw, field)) || background === undefined || carried === null) {
    return;
  }
  return `oklch(from ${derivedOriginFor(background, toOklch(background), carried.pixel)} ${carried.inks.foreground} 0 h / 1)`;
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

interface CarriedSurface {
  readonly vars: Readonly<Record<string, string>>;
  readonly inputBorderFallback: InputBorderFallback | undefined;
}

/** Everything a carried background derives: the surface family, and the form-control edge solved over it below the focus ring (D159). */
function carriedSurfaceOn(background: string, carried: CarriedPalette | null, ring: Oklch | null): CarriedSurface {
  const derivedOrigin = derivedOriginFor(background, toOklch(background), carried?.pixel ?? null);
  const surface = surfaceVarsOn(background, carried, derivedOrigin);
  if (carried === null) {
    return { vars: surface, inputBorderFallback: undefined };
  }
  const edge = inputBorderOn(derivedOrigin, carried, ring);
  return { vars: { ...surface, ...edge.vars }, inputBorderFallback: edge.fallback };
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
export function clampThemeTokens(
  raw: unknown,
  ambientBackground?: string,
  ambientAccent?: string,
  { palette = "seed", inks = {}, fills: ambientFills = {}, inside, asBox }: ScopeAmbient = {},
): ClampedTheme {
  const parsed = themeScopeTokensSchema.safeParse(raw);
  // Inside a box the box is the surface: a nested scope's background and bubble fills paint nothing there, only its inks hold.
  const t = insideBox(parsed.success ? parsed.data : {}, inside !== undefined && asBox !== true);
  const vars: Record<string, string> = {};
  const put = (name: string, value: string | undefined): void => {
    if (value !== undefined) {
      vars[name] = value;
    }
  };
  const carriedBase = t.background === undefined ? null : compositedBase(t.background, ambientBackground);
  const carried = carriedPaletteOf(carriedBase);
  const carriedAmbient = carriedAmbientOf(t, ambientBackground, palette);
  // The accent is judged against the CARD a carried base derives (#692) — see `accentEmissionOn`. With no
  // carried background, or when the accent already clears, this is the pre-#692 pass-through: the picked
  // value byte-identical, or nothing at all.
  const { accent, toneVars, fallback, inputBorderFallback: nestedEdgeFallback } = accentAndTonesOn(t.accent, ambientAccent, carried, carriedAmbient);
  put(THEME_OVERRIDE_COLOR_VARS.accent, accent?.fill);
  put("--color-ring", accent?.fill);
  // The accent's readable foreground derives off the accent this scope actually PAINTS with, so a dark
  // accent + static light text can never go invisible.
  put("--color-primary-foreground", accent?.foreground);
  // The §7a prose-ink clamp (#204, see the header law): the four author-picked inks are judged against
  // the BASE surface they will be painted on — every reading plate now derives from it, so
  // base-legibility is plate-legibility. A sensible pairing passes through BYTE-IDENTICAL; a failing ink
  // takes the least lightness move at full opacity, keeping hue and chroma where it can; a contextual/invalid
  // value with no readable ambient remains the one honest fail-open arm.
  //
  // THE BASE IS THE CARRIED ONE, ELSE THE AMBIENT ONE (#236). An override that picks inks and NO
  // background does not escape the judgement — it lands on the surface the app theme paints, which the
  // caller knows statically. The pre-#236 clamp read that arm as "polarity not statically knowable" and
  // failed open, which is what put every ST-imported card's dark-authored inks raw on the Light seed's
  // `oklch(0.98 0.004 75)` at 2.11-2.43:1 (4/4 rooms probed, 67 desktop P1s). The premise was false: no
  // carried background is precisely the case where the composed surface IS knowable. The residual
  // provider-less fail-open (neither side statically readable) stands unchanged.
  const inkBase = inkBaseFor(t.background, ambientBackground);
  const fillUnder = carriedBase === null ? ambientBackground : serializeOpaqueOklch(carriedBase);
  const fills = bubbleFillsOn(t, fillUnder, ambientFills);
  const insideFill = inside === undefined ? null : toOklch(inside);
  const seedHosts = t.background === undefined ? seedReadingHosts(ambientBackground) : null;
  // A carried base also owns every ABSENT prose pick (#985). Otherwise a legal background-only custom
  // theme inherits all four inks from the outer seed, which can be the opposite polarity. Derive the
  // fallback from the resolved carried pixel; with no carried background there is deliberately no
  // fallback and the cascade remains intact. Explicit picks still take the pass-through/correction arms
  // above, judged on the reading hosts of the base under them.
  Object.assign(vars, proseInkVars(raw, t, carried, { inkBase, seedHosts, inside: insideFill }));
  const surface = t.background === undefined ? undefined : carriedSurfaceOn(t.background, carried, accent?.painted ?? null);
  Object.assign(vars, surface?.vars);
  // After the surface emit: a picked fill paints over the one its base derives.
  Object.assign(vars, pickedBubbleVars(t, fillUnder));
  Object.assign(vars, toneVars);
  // An explicit border color wins over the derived hairline, for both border scopes.
  put(THEME_OVERRIDE_COLOR_VARS.borderColor, t.borderColor);
  put("--color-sidebar-border", t.borderColor);
  if (t.font !== undefined) {
    vars["--font-sans"] = fontStackFor(t.font);
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
  const proseInks = proseInksOf(t, inks, carried);
  return {
    vars,
    proseInks,
    bubbleFills: fills,
    bubbleScopes: bubbleScopesOn(fills, { ...seedInksOf(ambientBackground), ...proseInks }, accentSource),
    ...(t.density === undefined ? {} : { density: t.density }),
    ...(colorScheme === null ? {} : { colorScheme }),
    ...inheritedInkOn(vars),
    ...(accentSource === undefined ? {} : { accentSource }),
    ...carriedContextOn(carriedBase, fallback),
    ...edgeFallbackOn(surface?.inputBorderFallback, nestedEdgeFallback),
  };
}

/** The prose inks a descendant inherits: this scope's picks over the ambient's, or its picks and carried ink where its background rederives the rest. */
function proseInksOf(t: ThemeScopeTokens, ambient: ProseInks, carried: CarriedPalette | null): ProseInks {
  const inks: Record<string, string> = t.background === undefined ? { ...ambient } : {};
  for (const field of PROSE_INK_FIELDS) {
    const ink = t[field] ?? (carried === null ? undefined : serializeOpaqueOklch({ l: carried.inks.foreground, c: 0, h: carried.pixel.h }));
    if (ink !== undefined) {
      inks[field] = ink;
    }
  }
  return inks;
}

/** The D159 edge fallback a scope reports: its own carried edge, else the outer edge its accent's ring could not clear. A scope has at most one. */
function edgeFallbackOn(carried: InputBorderFallback | undefined, nested: InputBorderFallback | undefined): Pick<ClampedTheme, "inputBorderFallback"> {
  const fallback = carried ?? nested;
  return fallback === undefined ? {} : { inputBorderFallback: fallback };
}

/** The carried scope's context axes: its resolved base pixel and the D336 fallback it took, each only when present. */
function carriedContextOn(carriedBase: ParsedOklch | null, fallback: ToneFallback | undefined): Pick<ClampedTheme, "resolvedBackground" | "toneFallback"> {
  return {
    ...(carriedBase === null ? {} : { resolvedBackground: serializeOpaqueOklch(carriedBase) }),
    ...(fallback === undefined ? {} : { toneFallback: fallback }),
  };
}
