// D336 tone knobs and literal roles for a carried background. The `[data-tone]` blocks read `--tone-mix-*` and each
// colored tone's `--tone-<tone>-<role>` literal from the cascade, so a scope that paints its own palette emits both
// beside its colours; the root leaves every literal invalid, and the knob defaults clear every seed floor, which the token build proves.
import type { CarriedToneHost, Oklch, SolidInk, ToneColors, ToneMixGroup, TonePalette, ToneScheme, ToneSource } from "@orb/kit/theme-derivation";
import {
  accentFillLightness,
  carriedLiteralRoles,
  carriedTonePalette,
  compositeSrgb,
  oklchToSrgb,
  solidInkLightness,
  solveCarriedToneRoles,
  solveToneMix,
  srgbToOklch,
  toneRoleColors,
} from "@orb/kit/theme-derivation";
import type { Tone, ToneMixKnob, ToneRole } from "#tokens";
import { TOKEN_POLARITY_ARMS, TOKENS, TONE_MIX_DEFAULTS, TONE_ROLE_RECIPES, TONES, toneKnobVar, toneLiteralVar } from "#tokens";
import type { ParsedOklch } from "./color-parse.ts";
import { serializeOpaqueOklch, toOklch } from "./color-parse.ts";
import type { CarriedPalette } from "./derive-vars.ts";

/**
 * The scope knobs a carried palette re-solves (D336), judged over every tone it paints: text and the tint pair lower
 * toward the scope's own foreground and background, and the neutral solid steps raise toward the neutral solid.
 */
const SCOPE_MIX_GROUPS = [
  { direction: "lower", scaled: [], inner: "text" },
  { direction: "lower", scaled: ["tint", "tint-active"], inner: "text-on-tint" },
  { direction: "raise", inner: "neutral-hover" },
  { direction: "raise", inner: "neutral-active" },
] as const satisfies readonly ToneMixGroup<ToneMixKnob>[];

/**
 * The colored solid steps, solved per tone: each raises toward its own solid, which that solid's ink always clears,
 * so a primary that needs shallower steps never flattens destructive's, success's or info's hover feedback.
 */
const TONE_STEP_GROUPS = [
  { direction: "raise", inner: "hover" },
  { direction: "raise", inner: "active" },
] as const satisfies readonly ToneMixGroup<ToneMixKnob>[];

const STEP_KNOBS: readonly ToneMixKnob[] = TONE_STEP_GROUPS.map((group) => group.inner);
const SCOPE_KNOBS: readonly ToneMixKnob[] = [
  ...SCOPE_MIX_GROUPS.flatMap((group): ToneMixKnob[] => ("scaled" in group ? [...group.scaled, group.inner] : [group.inner])),
  ...STEP_KNOBS,
];

type ColoredTone = Exclude<Tone, "neutral">;
type IntentTone = Exclude<ColoredTone, "primary">;
export type CarriedToneScheme = ToneScheme<ToneRole, ToneMixKnob, CarriedToneHost>;

const COLORED_TONES = TONES.filter((tone): tone is ColoredTone => tone !== "neutral");
const LITERAL_ROLES = carriedLiteralRoles(TONE_ROLE_RECIPES, TONE_MIX_DEFAULTS);

/** The guaranteed-invalid value: a literal declared `initial` makes the `[data-tone]` block's `var()` take its mix. */
const MIX_FALLBACK = "initial";

/** The fill a scope paints for an accent, and whether that pixel is the authored spelling itself. */
export interface AccentPaint {
  readonly fill: Oklch;
  readonly authored: boolean;
}

function intentColor(path: keyof typeof TOKEN_POLARITY_ARMS, polarity: Polarity): Oklch {
  const parsed = toOklch(TOKEN_POLARITY_ARMS[path][polarity]);
  if (parsed === null) {
    throw new Error(`generated polarity arm ${path} is not a parseable color`);
  }
  return parsed;
}

type Polarity = TonePalette<CarriedToneHost>["polarity"];

function intentTonesAt(polarity: Polarity): Readonly<Record<IntentTone, ToneColors>> {
  const intents = COLORED_TONES.filter((tone): tone is IntentTone => tone !== "primary");
  return Object.fromEntries(
    intents.map((tone) => [tone, { base: intentColor(`color.${tone}`, polarity), foreground: intentColor(`color.${tone}-foreground`, polarity) }]),
  ) as Record<IntentTone, ToneColors>;
}

/** Each intent tone's colours at each polarity, parsed once: every carried scope reads them, and they are generated constants. */
const INTENT_TONES: Readonly<Record<Polarity, Readonly<Record<IntentTone, ToneColors>>>> = { light: intentTonesAt("light"), dark: intentTonesAt("dark") };

function intentTone(tone: IntentTone, polarity: Polarity): ToneColors {
  return INTENT_TONES[polarity][tone];
}

/** The hover and active steps a solid takes under this scheme at the default knobs. */
function solidSteps(scheme: CarriedToneScheme, fill: Oklch): readonly Oklch[] {
  const roles = toneRoleColors(scheme, { base: fill, foreground: fill }, TONE_MIX_DEFAULTS);
  return [roles["solid-hover"], roles["solid-active"]];
}

/** The scheme a carried palette resolves its tone roles against. */
export function carriedToneScheme({ pixel, inks }: CarriedPalette): CarriedToneScheme {
  return { recipes: TONE_ROLE_RECIPES, palette: carriedTonePalette(pixel, inks) };
}

/**
 * The opaque pixel a carried scope paints for an accent (#692, D336): the corrected fill when the card needs one,
 * else the accent itself, composited over the scope's background when translucent and gamut-mapped when out of
 * gamut. The clamp emits exactly this pixel, so the colour it judges is the colour the browser paints.
 */
export function paintedAccentFill(scheme: CarriedToneScheme, accent: ParsedOklch): AccentPaint {
  const verdict = accentFillLightness({ l: accent.l, c: accent.c, h: accent.h }, accent.alpha, scheme.palette.background);
  if (verdict.kind === "corrected") {
    return { fill: verdict.fill, authored: false };
  }
  const opaque = oklchToSrgb(accent);
  const pixel = accent.alpha < 1 ? compositeSrgb(opaque, accent.alpha, oklchToSrgb(scheme.palette.background)) : opaque;
  return { fill: srgbToOklch(pixel), authored: accent.alpha >= 1 && accent.inGamut !== false };
}

/** The ink paired with an accent fill: one ink over the fill and its solid steps where one exists, else the fill's
 *  own ink, and the solve raises the step knobs until it clears them too. */
export function accentInk(scheme: CarriedToneScheme, fill: Oklch): SolidInk {
  return solidInkLightness(fill, solidSteps(scheme, fill));
}

/** One tone a carried scope paints, by name. */
export interface CarriedTone {
  readonly tone: Tone;
  readonly source: ToneSource;
}

/** A carried scope's tones: neutral on its ramp, the intent arms at its polarity, and the primary it paints, when known. */
export function carriedToneSources(scheme: CarriedToneScheme, primaryFill: Oklch | null): readonly CarriedTone[] {
  return TONES.flatMap((tone): CarriedTone[] => {
    if (tone === "neutral") {
      return [{ tone, source: "neutral" }];
    }
    if (tone === "primary") {
      return primaryFill === null
        ? []
        : [{ tone, source: { base: primaryFill, foreground: { l: accentInk(scheme, primaryFill).lightness, c: 0, h: primaryFill.h } } }];
    }
    return [{ tone, source: intentTone(tone, scheme.palette.polarity) }];
  });
}

/** The knobs a carried scope solved: its scope knobs, and the solid steps each tone raised over them. */
export interface CarriedToneMix {
  readonly scope: Readonly<Record<ToneMixKnob, number>>;
  readonly raised: Readonly<Partial<Record<Tone, Readonly<Partial<Record<ToneMixKnob, number>>>>>>;
}

/** The knob percents a carried scope emits, solved over every tone it paints, its solid steps per tone. */
export function solveCarriedToneMix(scheme: CarriedToneScheme, tones: readonly CarriedTone[]): CarriedToneMix {
  const scope = solveToneMix(
    scheme,
    tones.map(({ source }) => source),
    { defaults: TONE_MIX_DEFAULTS, groups: SCOPE_MIX_GROUPS },
  );
  const raised = Object.fromEntries(
    tones.flatMap(({ tone, source }) => {
      if (source === "neutral") {
        return [];
      }
      const own = solveToneMix(scheme, [source], { defaults: scope, groups: TONE_STEP_GROUPS });
      const steps = STEP_KNOBS.filter((knob) => own[knob] !== scope[knob]);
      return steps.length === 0 ? [] : [[tone, Object.fromEntries(steps.map((knob) => [knob, own[knob]]))]];
    }),
  );
  return { scope, raised };
}

/** The mix one tone's roles read: the scope's knobs with that tone's raised steps over them. */
export function toneMixOf(mix: CarriedToneMix, tone: Tone): Readonly<Record<ToneMixKnob, number>> {
  return { ...mix.scope, ...mix.raised[tone] };
}

/**
 * The `--tone-mix-*` declarations for a carried scope. Every scope knob is emitted, at its default too, and every
 * colored tone's step knobs are emitted, raised or at the scope's value, so a nested scope never inherits an outer palette's solve.
 */
export function toneMixVars(mix: CarriedToneMix): Readonly<Record<string, string>> {
  const scope = SCOPE_KNOBS.map((knob) => [TOKENS[`tone-mix.${knob}`].cssVar, `${mix.scope[knob]}%`] as const);
  const perTone = TONES.filter((tone) => tone !== "neutral").flatMap((tone) =>
    STEP_KNOBS.map((knob) => {
      const raised = mix.raised[tone]?.[knob];
      return [toneKnobVar(tone, knob), `${raised ?? mix.scope[knob]}%`] as const;
    }),
  );
  return Object.fromEntries([...scope, ...perTone]);
}

/**
 * The literal role colours a carried scope emits (D336), one per colored tone and literal role: each keeps its tone's
 * hue where a mix toward this palette's page would grey it out. A tone the scope cannot judge, a primary with no known
 * accent, declares the mix fallback, so a nested scope never paints an outer palette's literal.
 */
export function toneLiteralVars(scheme: CarriedToneScheme, tones: readonly CarriedTone[]): Readonly<Record<string, string>> {
  return Object.fromEntries(COLORED_TONES.flatMap((tone) => toneLiteralEntries(scheme, tone, tones)));
}

function toneLiteralEntries(scheme: CarriedToneScheme, tone: ColoredTone, tones: readonly CarriedTone[]): readonly (readonly [string, string])[] {
  const source = tones.find((carried) => carried.tone === tone)?.source;
  const literals = source === undefined || source === "neutral" ? undefined : solveCarriedToneRoles(scheme, source, TONE_MIX_DEFAULTS);
  return LITERAL_ROLES.map((role) => {
    if (literals === undefined) {
      return [toneLiteralVar(tone, role), MIX_FALLBACK] as const;
    }
    const color = literals[role];
    if (color === undefined) {
      throw new Error(`the kit solved no literal for ${tone} ${role}, which it classed as literal`);
    }
    return [toneLiteralVar(tone, role), serializeOpaqueOklch(color)] as const;
  });
}

/**
 * The primary roles a scope emits when it paints its own accent over a carried palette (D336): the primary's literals
 * and solid steps solved on that palette. Every other knob and literal stays the outer scope's solve through the cascade.
 */
export function primaryToneVars(scheme: CarriedToneScheme, mix: CarriedToneMix, tones: readonly CarriedTone[]): Readonly<Record<string, string>> {
  const steps = toneMixOf(mix, "primary");
  return Object.fromEntries([
    ...STEP_KNOBS.map((knob) => [toneKnobVar("primary", knob), `${steps[knob]}%`] as const),
    ...toneLiteralEntries(scheme, "primary", tones),
  ]);
}

/**
 * The primary literals a scope that paints its own accent over a seed palette resets to the mix fallback: the mix
 * follows this scope's `--color-primary` over the seed's own ramp, which the token build holds to the floors.
 */
export function primaryLiteralResets(): Readonly<Record<string, string>> {
  return Object.fromEntries(LITERAL_ROLES.map((role) => [toneLiteralVar("primary", role), MIX_FALLBACK]));
}
