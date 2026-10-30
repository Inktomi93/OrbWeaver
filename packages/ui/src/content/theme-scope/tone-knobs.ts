// D336 tone knobs for a carried background. The `[data-tone]` blocks read `--tone-mix-*` from the cascade, so a
// scope that paints its own palette solves the amounts its ramp and intent bases need and emits them beside its
// colours; the knob defaults clear every shipped palette, and the token build proves that.
import type { CarriedToneHost, Oklch, ToneColors, ToneMixGroup, TonePalette, ToneScheme, ToneSource } from "@orb/kit/theme-derivation";
import {
  accentFillLightness,
  carriedTonePalette,
  derivedForegroundLightness,
  familyForegroundLightness,
  solveToneMix,
  toneRoleColors,
} from "@orb/kit/theme-derivation";
import type { Tone, ToneMixKnob, ToneRole } from "#tokens";
import { TOKEN_POLARITY_ARMS, TOKENS, TONE_MIX_DEFAULTS, TONE_ROLE_RECIPES, TONES } from "#tokens";
import type { ParsedOklch } from "./color-parse.ts";
import { toOklch } from "./color-parse.ts";

/**
 * The knobs a carried palette re-solves (D336). Text and the tint pair lower toward the scope's own foreground and
 * background; the neutral solid steps raise toward the solid. The colored hover and active knobs move away from the
 * page ink, which only widens the pair the intent tokens already clear, so they keep their defaults.
 */
const TONE_MIX_GROUPS = [
  { direction: "lower", scaled: [], inner: "text" },
  { direction: "lower", scaled: ["tint", "tint-active"], inner: "text-on-tint" },
  { direction: "raise", inner: "neutral-hover" },
  { direction: "raise", inner: "neutral-active" },
] as const satisfies readonly ToneMixGroup<ToneMixKnob>[];

const SOLVED_TONE_KNOBS: readonly ToneMixKnob[] = TONE_MIX_GROUPS.flatMap((group) => ("scaled" in group ? [...group.scaled, group.inner] : [group.inner]));

type IntentTone = Exclude<Tone, "primary" | "neutral">;
export type CarriedToneScheme = ToneScheme<ToneRole, ToneMixKnob, CarriedToneHost>;

function intentColor(path: keyof typeof TOKEN_POLARITY_ARMS, polarity: TonePalette<CarriedToneHost>["polarity"]): Oklch {
  const parsed = toOklch(TOKEN_POLARITY_ARMS[path][polarity]);
  if (parsed === null) {
    throw new Error(`generated polarity arm ${path} is not a parseable color`);
  }
  return parsed;
}

function intentTone(tone: IntentTone, polarity: TonePalette<CarriedToneHost>["polarity"]): ToneColors {
  return { base: intentColor(`color.${tone}`, polarity), foreground: intentColor(`color.${tone}-foreground`, polarity) };
}

/** The hover and active steps a solid takes under this scheme at the default knobs. */
function solidSteps(scheme: CarriedToneScheme, fill: Oklch): readonly Oklch[] {
  const roles = toneRoleColors(scheme, { base: fill, foreground: fill }, TONE_MIX_DEFAULTS);
  return [roles["solid-hover"], roles["solid-active"]];
}

/** The scheme a carried base resolves its tone roles against. */
export function carriedToneScheme(base: Oklch): CarriedToneScheme {
  return { recipes: TONE_ROLE_RECIPES, palette: carriedTonePalette(base) };
}

/**
 * The primary a carried scope paints for an accent (#692 extended by D336): the accent at the lightness the
 * correction picks when the card or the solid steps need it, else `null` and the accent passes through.
 */
export function correctedAccentFill(scheme: CarriedToneScheme, accent: ParsedOklch): Oklch | null {
  const lightness = accentFillLightness({ l: accent.l, c: accent.c, h: accent.h }, accent.alpha, scheme.palette.background, (fill) => solidSteps(scheme, fill));
  return lightness === null ? null : { l: lightness, c: accent.c, h: accent.h };
}

/** The ink lightness paired with an accent fill: one ink over the fill and its solid steps where one exists, else the fill's own. */
export function accentInkLightness(scheme: CarriedToneScheme, fill: Oklch): number {
  return familyForegroundLightness([fill, ...solidSteps(scheme, fill)]) ?? derivedForegroundLightness(fill);
}

/** A carried scope's tones: neutral on its ramp, the intent arms at its polarity, and the primary it paints, when known. */
export function carriedToneSources(scheme: CarriedToneScheme, primaryFill: Oklch | null): readonly ToneSource[] {
  return TONES.flatMap((tone): ToneSource[] => {
    if (tone === "neutral") {
      return ["neutral"];
    }
    if (tone === "primary") {
      return primaryFill === null ? [] : [{ base: primaryFill, foreground: { l: accentInkLightness(scheme, primaryFill), c: 0, h: primaryFill.h } }];
    }
    return [intentTone(tone, scheme.palette.polarity)];
  });
}

/** The knob percents a carried scope emits, solved over every tone it paints. */
export function solveCarriedToneMix(scheme: CarriedToneScheme, sources: readonly ToneSource[]): Readonly<Record<ToneMixKnob, number>> {
  return solveToneMix(scheme, sources, { defaults: TONE_MIX_DEFAULTS, groups: TONE_MIX_GROUPS });
}

/** The `--tone-mix-*` declarations for the solved knobs. Every solved knob is emitted, at its default too, so a nested
 *  scope never inherits an outer palette's solve. */
export function toneMixVars(mix: Readonly<Record<ToneMixKnob, number>>): Readonly<Record<string, string>> {
  return Object.fromEntries(SOLVED_TONE_KNOBS.map((knob) => [TOKENS[`tone-mix.${knob}`].cssVar, `${mix[knob]}%`]));
}
