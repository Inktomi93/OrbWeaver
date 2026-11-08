// The D336 judge the tone suites share: it runs the production clamp, reads the emitted variables back, knobs and
// literals, and lists every floor and tint separation the pixels they spell miss on every host.
import { hueDistance } from "@orb/kit/safe-color";
import type { Oklch, ToneHost } from "@orb/kit/theme-derivation";
import {
  carriedLiteralRoles,
  paintedDistance,
  roleFloorMisses,
  TONE_HOSTS,
  TONE_HUE_ADJACENT_DEGREES,
  TONE_TINT_SEPARATION,
  tonePaletteOn,
  toneRoleColors,
} from "@orb/kit/theme-derivation";
import { HEARTH_ACCENT } from "@orb/testkit/iso";
import type { Tone, ToneMixKnob, ToneRole } from "@orb/ui/tokens";
import { TOKENS, TONE_MIX_DEFAULTS, TONE_ROLE_RECIPES, toneKnobVar, toneLiteralVar } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import type { ParsedOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { carriedPaletteOf } from "../../../../packages/ui/src/content/theme-scope/derive-vars.ts";
import type { CarriedTone, CarriedToneScheme } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { carriedToneScheme, carriedToneSources, MIX_FALLBACK } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";

/** A colour the case authored, parsed; a spelling that does not parse is a broken case. */
export function parsed(color: string): ParsedOklch {
  const value = toOklch(color);
  if (value === null) {
    throw new Error(`${color} does not parse`);
  }
  return value;
}

/** An emitted `oklch(from <origin> <l> 0 h / <alpha>)` as the achromatic pixel it paints at `hue`, and its alpha. */
export function emittedGrey(spelling: string | undefined, hue = 0): { readonly color: Oklch; readonly alpha: number } {
  const match = /^oklch\(from .+ ([\d.]+) 0 h \/ ([\d.]+)\)$/u.exec(spelling ?? "");
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`not an emitted grey: ${spelling}`);
  }
  return { color: { l: Number(match[1]), c: 0, h: hue }, alpha: Number(match[2]) };
}

/** The ink the clamp emits as `oklch(from <fill> <l> 0 h / 1)`: an opaque achromatic pixel at that lightness. */
export function emittedInk(spelling: string | undefined, hue = 0): Oklch {
  const { color, alpha } = emittedGrey(spelling, hue);
  if (alpha !== 1) {
    throw new Error(`not an opaque emitted ink: ${spelling}`);
  }
  return color;
}

/** The mix one tone reads from a scope's emitted variables: its own step knob when set, else the scope's knob. */
export function emittedMix(vars: Readonly<Record<string, string>>, tone: Tone): Readonly<Record<ToneMixKnob, number>> {
  const knob = (name: ToneMixKnob): number => {
    const own = vars[toneKnobVar(tone, name)];
    const scope = vars[TOKENS[`tone-mix.${name}`].cssVar];
    const emitted = own ?? scope;
    return emitted === undefined ? TONE_MIX_DEFAULTS[name] : Number.parseFloat(emitted);
  };
  return {
    hover: knob("hover"),
    active: knob("active"),
    "neutral-hover": knob("neutral-hover"),
    "neutral-active": knob("neutral-active"),
    text: knob("text"),
    "text-on-tint": knob("text-on-tint"),
    tint: knob("tint"),
    "tint-active": knob("tint-active"),
    edge: knob("edge"),
  } satisfies Record<ToneMixKnob, number>;
}

/** The roles a soft fill paints: the tints the separation floor holds off the page and off each other. */
const TINT_ROLES = ["tint", "tint-active"] as const satisfies readonly ToneRole[];

const LITERAL_ROLES: readonly ToneRole[] = carriedLiteralRoles(TONE_ROLE_RECIPES, TONE_MIX_DEFAULTS);

/** Two tones whose hues sit within the adjacency bound: their tints owe each other no separation. */
export function hueAdjacent(a: Oklch, b: Oklch): boolean {
  return hueDistance(a.h, b.h) < TONE_HUE_ADJACENT_DEGREES;
}

/** The literals a scope emitted for one tone, parsed once: a literal paints the same on every host. */
export function emittedLiterals(vars: Readonly<Record<string, string>>, tone: Tone): Readonly<Partial<Record<ToneRole, Oklch>>> {
  if (tone === "neutral") {
    return {};
  }
  return Object.fromEntries(
    LITERAL_ROLES.flatMap((role) => {
      const spelling = vars[toneLiteralVar(tone, role)];
      return spelling === undefined || spelling === MIX_FALLBACK ? [] : [[role, parsed(spelling)] as const];
    }),
  );
}

/** What one tone reads from the emitted scope on every host: its knobs and its literals. */
interface EmittedTone {
  readonly carried: CarriedTone;
  readonly mix: Readonly<Record<ToneMixKnob, number>>;
  readonly literals: Readonly<Partial<Record<ToneRole, Oklch>>>;
}

function emittedTone(vars: Readonly<Record<string, string>>, carried: CarriedTone): EmittedTone {
  return { carried, mix: emittedMix(vars, carried.tone), literals: emittedLiterals(vars, carried.tone) };
}

/** Every role one tone paints on the scheme's host: its emitted literal where it has one, else its mix at the emitted knobs. */
function rolesOn(scheme: CarriedToneScheme, { carried, mix, literals }: EmittedTone): Readonly<Record<ToneRole, Oklch>> {
  return { ...toneRoleColors(scheme, carried.source, mix), ...literals };
}

/** Every role one carried tone paints on the scheme's host, read from the scope's emitted variables. */
export function paintedRoles(scheme: CarriedToneScheme, vars: Readonly<Record<string, string>>, carried: CarriedTone): Readonly<Record<ToneRole, Oklch>> {
  return rolesOn(scheme, emittedTone(vars, carried));
}

/** The carried scheme per background: every accent on one page reuses its palette, its solved inks and its host pixels. */
const SCHEMES = new Map<string, CarriedToneScheme>();

function schemeOf(background: string): CarriedToneScheme {
  const known = SCHEMES.get(background);
  if (known !== undefined) {
    return known;
  }
  const scheme = carriedToneScheme(carriedPaletteOf(parsed(background)));
  SCHEMES.set(background, scheme);
  return scheme;
}

/** One emitted scope: the page's carried scheme, the variables the clamp emitted, and every tone they paint. */
export interface EmittedScope {
  readonly scheme: CarriedToneScheme;
  readonly vars: Readonly<Record<string, string>>;
  readonly tones: readonly CarriedTone[];
}

type ClampedTheme = ReturnType<typeof clampThemeTokens>;

/** The scope that inherits Hearth's accent on one page: several cases judge it, so each page is solved once. */
const HEARTH_SCOPES = new Map<string, ClampedTheme>();

function clampedScope(background: string, tokens: { readonly accent?: string }, ambientAccent?: string): ClampedTheme {
  if (tokens.accent !== undefined || ambientAccent !== HEARTH_ACCENT) {
    return clampThemeTokens({ background, ...tokens }, undefined, ambientAccent);
  }
  const known = HEARTH_SCOPES.get(background);
  if (known !== undefined) {
    return known;
  }
  const clamped = clampThemeTokens({ background }, undefined, HEARTH_ACCENT);
  HEARTH_SCOPES.set(background, clamped);
  return clamped;
}

/** A carried scope as the clamp emits it: its intents and neutral from the carried palette, its primary as emitted. */
export function emittedScope(background: string, tokens: { readonly accent?: string }, ambientAccent?: string): EmittedScope {
  const { vars } = clampedScope(background, tokens, ambientAccent);
  const scheme = schemeOf(background);
  const fill = vars[TOKENS["color.primary"].cssVar];
  const primary: CarriedTone[] =
    fill === undefined ? [] : [{ tone: "primary", source: { base: parsed(fill), foreground: emittedInk(vars[TOKENS["color.primary-foreground"].cssVar]) } }];
  return { scheme, vars, tones: [...carriedToneSources(scheme, null), ...primary] };
}

/**
 * An accent-only scope nested in a carried palette on `background`, as the cascade resolves it: the outer scope's variables
 * with the nested scope's over them, and the outer palette's tones with the primary the nested scope paints.
 */
export function nestedAccentScope(background: string, accent: string): EmittedScope {
  const outer = clampedScope(background, {}, HEARTH_ACCENT);
  const nested = clampThemeTokens({ accent }, outer.resolvedBackground, outer.accentSource, { palette: "carried" });
  const vars = { ...outer.vars, ...nested.vars };
  const scheme = schemeOf(background);
  const primary: CarriedTone = {
    tone: "primary",
    source: { base: parsed(vars[TOKENS["color.primary"].cssVar] ?? ""), foreground: emittedInk(vars[TOKENS["color.primary-foreground"].cssVar]) },
  };
  return { scheme, vars, tones: [...carriedToneSources(scheme, null), primary] };
}

/** Every D336 floor the emitted scope misses, and every tint closer than the separation to the page or to a non-adjacent tone's tint. */
export function emittedMisses(background: string, tokens: { readonly accent?: string }, ambientAccent?: string): readonly string[] {
  return scopeMisses(emittedScope(background, tokens, ambientAccent), `${background} ${JSON.stringify(tokens)} ${ambientAccent ?? ""}`);
}

/** The scope's misses over every host a wash sits on: a mix that falls back reads the host, a literal serves them all. */
export function scopeMisses({ scheme, vars, tones }: EmittedScope, label: string): readonly string[] {
  const emitted = tones.map((carried) => emittedTone(vars, carried));
  return TONE_HOSTS.flatMap((host) => hostMisses({ ...scheme, palette: tonePaletteOn(scheme.palette, host) }, emitted, label, host));
}

function hostMisses(scheme: CarriedToneScheme, emitted: readonly EmittedTone[], label: string, host: ToneHost): readonly string[] {
  const painted = emitted.map((tone) => ({ carried: tone.carried, roles: rolesOn(scheme, tone) }));
  const colored = painted.flatMap(({ carried, roles }) => (carried.source === "neutral" ? [] : [{ tone: carried.tone, base: carried.source.base, roles }]));
  const floors = painted.flatMap(({ carried, roles }) =>
    roleFloorMisses(scheme, carried.source, (role) => roles[role]).map((miss) => `${label} ${carried.tone} over ${host} ${JSON.stringify(miss)}`),
  );
  const offPage = colored.flatMap(({ tone, roles }) =>
    TINT_ROLES.flatMap((role) => {
      const distance = paintedDistance(roles[role], scheme.palette.host);
      return distance >= TONE_TINT_SEPARATION ? [] : [`${label} ${tone} ${role} sits ${distance.toFixed(4)} off ${host}`];
    }),
  );
  const pairs = colored.flatMap((a, index) =>
    colored.slice(index + 1).flatMap((b) =>
      hueAdjacent(a.base, b.base)
        ? []
        : TINT_ROLES.flatMap((role) => {
            const distance = paintedDistance(a.roles[role], b.roles[role]);
            return distance >= TONE_TINT_SEPARATION ? [] : [`${label} ${a.tone}/${b.tone} ${role} sit ${distance.toFixed(4)} apart`];
          }),
    ),
  );
  return [...floors, ...offPage, ...pairs];
}
