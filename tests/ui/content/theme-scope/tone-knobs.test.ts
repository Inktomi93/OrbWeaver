// D336: what the ThemeScope clamp emits for a carried background clears every tone's floors, primary included, for
// picked and inherited accents, and keeps each tint off the page and off every tint of a non-adjacent hue. Each case
// reads the emitted variables back, knobs and literals, and judges the pixels they spell.
import { hueDistance } from "@orb/kit/safe-color";
import type { Oklch } from "@orb/kit/theme-derivation";
import {
  carriedLiteralRoles,
  oklchToSrgb,
  paintedDistance,
  roleFloorMisses,
  srgbToOklch,
  TONE_HUE_ADJACENT_DEGREES,
  TONE_TINT_SEPARATION,
  toneFloorMisses,
  toneRoleColors,
} from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { Tone, ToneMixKnob, ToneRole } from "@orb/ui/tokens";
import { TOKEN_POLARITY_ARMS, TOKENS, TONE_MIX_DEFAULTS, TONE_MIX_KNOBS, TONE_ROLE_RECIPES, toneKnobVar, toneLiteralVar } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import type { ParsedOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { serializeOpaqueOklch, toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { carriedPaletteOf } from "../../../../packages/ui/src/content/theme-scope/derive-vars.ts";
import type { CarriedTone, CarriedToneScheme } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { carriedToneScheme, carriedToneSources } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { BASES, keepsHue, MID_GREY } from "./contrast-cases.ts";

// The sweeps run the production clamp per case; they outrun the default per-test budget.
const SWEEP_TIMEOUT_MS = 180_000;
const HEARTH_ACCENT = TOKENS["color.primary"].value;
const ACCENT_LIGHTNESSES = Array.from({ length: 20 }, (_unused, index) => (index + 0.5) / 20);
const ACCENT_CHROMAS = [0, 0.06, 0.12, 0.2, 0.37];
const ACCENT_HUES = Array.from({ length: 8 }, (_unused, index) => index * 45);
const ACCENTS = ACCENT_LIGHTNESSES.flatMap((l) => ACCENT_CHROMAS.flatMap((c) => ACCENT_HUES.map((h) => `oklch(${l} ${c} ${h})`)));

function parsed(color: string): ParsedOklch {
  const value = toOklch(color);
  if (value === null) {
    throw new Error(`${color} does not parse`);
  }
  return value;
}

/** The ink the clamp emits as `oklch(from <fill> <l> 0 h / 1)`: an achromatic pixel at that lightness. */
function emittedInk(spelling: string | undefined): Oklch {
  const lightness = /^oklch\(from .+ ([\d.]+) 0 h \/ 1\)$/u.exec(spelling ?? "")?.[1];
  if (lightness === undefined) {
    throw new Error(`not an emitted ink: ${spelling}`);
  }
  return { l: Number(lightness), c: 0, h: 0 };
}

/** The mix one tone reads from a scope's emitted variables: its own step knob when set, else the scope's knob. */
function emittedMix(vars: Readonly<Record<string, string>>, tone: Tone): Readonly<Record<ToneMixKnob, number>> {
  const knob = (name: ToneMixKnob): number => {
    const own = vars[toneKnobVar(tone, name)];
    const scope = vars[TOKENS[`tone-mix.${name}`].cssVar];
    const emitted = own ?? scope;
    return emitted === undefined ? TONE_MIX_DEFAULTS[name] : Number.parseFloat(emitted);
  };
  return Object.fromEntries(TONE_MIX_KNOBS.map((name) => [name, knob(name)])) as Record<ToneMixKnob, number>;
}

/** The roles a soft fill paints: the tints the separation floor holds off the page and off each other. */
const TINT_ROLES = ["tint", "tint-active"] as const satisfies readonly ToneRole[];

const LITERAL_ROLES: readonly ToneRole[] = carriedLiteralRoles(TONE_ROLE_RECIPES, TONE_MIX_DEFAULTS);

/** Two tones whose hues sit within the adjacency bound: their tints owe each other no separation. */
function hueAdjacent(a: Oklch, b: Oklch): boolean {
  return hueDistance(a.h, b.h) < TONE_HUE_ADJACENT_DEGREES;
}

/** The literal a scope emitted for one tone's role, or `undefined` where the role paints its mix. */
function emittedLiteral(vars: Readonly<Record<string, string>>, tone: Tone, role: ToneRole): Oklch | undefined {
  if (tone === "neutral" || !LITERAL_ROLES.includes(role)) {
    return;
  }
  const spelling = vars[toneLiteralVar(tone, role)];
  return spelling === undefined || spelling === "initial" ? undefined : parsed(spelling);
}

/** Every role one tone paints under the emitted scope: its emitted literal where it has one, else its mix at the emitted knobs. */
function paintedRoles(scheme: CarriedToneScheme, vars: Readonly<Record<string, string>>, { tone, source }: CarriedTone): Readonly<Record<ToneRole, Oklch>> {
  const mixed = toneRoleColors(scheme, source, emittedMix(vars, tone));
  return Object.fromEntries(Object.entries(mixed).map(([role, color]) => [role, emittedLiteral(vars, tone, role as ToneRole) ?? color])) as Record<
    ToneRole,
    Oklch
  >;
}

interface EmittedScope {
  readonly scheme: CarriedToneScheme;
  readonly vars: Readonly<Record<string, string>>;
  readonly tones: readonly CarriedTone[];
}

/** A carried scope as the clamp emits it: its intents and neutral from the carried palette, its primary as emitted. */
function emittedScope(background: string, tokens: { readonly accent?: string }, ambientAccent?: string): EmittedScope {
  const { vars } = clampThemeTokens({ background, ...tokens }, undefined, ambientAccent);
  const scheme = carriedToneScheme(carriedPaletteOf(parsed(background)));
  const fill = vars["--color-primary"];
  const primary: CarriedTone[] =
    fill === undefined ? [] : [{ tone: "primary", source: { base: parsed(fill), foreground: emittedInk(vars["--color-primary-foreground"]) } }];
  return { scheme, vars, tones: [...carriedToneSources(scheme, null), ...primary] };
}

/**
 * An accent-only scope nested in a carried palette on `background`, as the cascade resolves it: the outer scope's variables
 * with the nested scope's over them, and the outer palette's tones with the primary the nested scope paints.
 */
function nestedAccentScope(background: string, accent: string): EmittedScope {
  const outer = clampThemeTokens({ background }, undefined, HEARTH_ACCENT);
  const nested = clampThemeTokens({ accent }, outer.resolvedBackground, outer.accentSource, "carried");
  const vars = { ...outer.vars, ...nested.vars };
  const scheme = carriedToneScheme(carriedPaletteOf(parsed(background)));
  const primary: CarriedTone = {
    tone: "primary",
    source: { base: parsed(vars["--color-primary"] ?? ""), foreground: emittedInk(vars["--color-primary-foreground"]) },
  };
  return { scheme, vars, tones: [...carriedToneSources(scheme, null), primary] };
}

/** Every D336 floor the emitted scope misses, and every tint closer than the separation to the page or to a non-adjacent tone's tint. */
function emittedMisses(background: string, tokens: { readonly accent?: string }, ambientAccent?: string): readonly string[] {
  return scopeMisses(emittedScope(background, tokens, ambientAccent), `${background} ${JSON.stringify(tokens)} ${ambientAccent ?? ""}`);
}

function scopeMisses({ scheme, vars, tones }: EmittedScope, label: string): readonly string[] {
  const colored = tones.flatMap((carried) =>
    carried.source === "neutral" ? [] : [{ ...carried, base: carried.source.base, roles: paintedRoles(scheme, vars, carried) }],
  );
  const floors = tones.flatMap((carried) => {
    const roles = paintedRoles(scheme, vars, carried);
    return roleFloorMisses(scheme, carried.source, (role) => roles[role]).map((miss) => `${label} ${carried.tone} ${JSON.stringify(miss)}`);
  });
  const offPage = colored.flatMap(({ tone, roles }) =>
    TINT_ROLES.flatMap((role) => {
      const distance = paintedDistance(roles[role], scheme.palette.background);
      return distance >= TONE_TINT_SEPARATION ? [] : [`${label} ${tone} ${role} sits ${distance.toFixed(4)} off the page`];
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

// The hue and chroma a colour paints at in the 8-bit framebuffer. The kit's own twin stays private: only
// `paintedDistance` reads it in production, and an export no production caller needs is a test-only door.
function framebuffer(color: Oklch): Oklch {
  const { r, g, b } = oklchToSrgb(color);
  return srgbToOklch({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
}

test("the adjacency bound exempts Hearth's primary beside warning, never destructive beside warning", () => {
  const arm = (path: keyof typeof TOKEN_POLARITY_ARMS): Oklch => parsed(TOKEN_POLARITY_ARMS[path].dark);
  expect(hueAdjacent(parsed(HEARTH_ACCENT), arm("color.warning"))).toBe(true);
  expect(hueAdjacent(arm("color.destructive"), arm("color.warning"))).toBe(false);
});

test("on a mid-grey page every colored tone's text, tint and solid keeps its hue", () => {
  const { scheme, vars, tones } = emittedScope(MID_GREY, {}, HEARTH_ACCENT);
  const lost = tones.flatMap((carried) => {
    if (carried.source === "neutral") {
      return [];
    }
    const { base } = carried.source;
    const roles = paintedRoles(scheme, vars, carried);
    return (["solid", "text", "tint", "tint-active"] as const satisfies readonly ToneRole[]).flatMap((role) => {
      const painted = framebuffer(roles[role]);
      return keepsHue(painted, base.h) ? [] : [`${carried.tone} ${role} paints ${JSON.stringify(painted)} for a base at hue ${base.h.toFixed(1)}`];
    });
  });
  expect(lost).toEqual([]);
  expect(emittedMisses(MID_GREY, {}, HEARTH_ACCENT)).toEqual([]);
});

test("a fallback raises only the tone that needs it: primary's steps rise while destructive keeps the default", () => {
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)", accent: "oklch(0.3 0.1 260)" });
  const primary = emittedMix(vars, "primary");
  const destructive = emittedMix(vars, "destructive");
  expect(primary.hover).toBeGreaterThan(TONE_MIX_DEFAULTS.hover);
  expect(primary.active).toBeGreaterThan(TONE_MIX_DEFAULTS.active);
  expect(destructive.hover).toBe(TONE_MIX_DEFAULTS.hover);
  expect(destructive.active).toBe(TONE_MIX_DEFAULTS.active);
});

test("a picked accent whose fill and solid steps share no ink still clears its hover and active floors", () => {
  expect(emittedMisses("oklch(0.5 0 0)", { accent: "oklch(0.53 0.2 30)" })).toEqual([]);
});

test("an out-of-gamut accent is judged as the pixel it paints", () => {
  const authored = "oklch(0.78 0.4 140)";
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)", accent: authored });
  expect(vars["--color-primary"]).not.toBe(authored);
  expect(toOklch(vars["--color-primary"] ?? "")?.inGamut).toBe(true);
  expect(emittedMisses("oklch(0.158 0.006 60)", { accent: authored })).toEqual([]);
});

test(
  "every tone clears every D336 floor and every tint its separation over the accepted-base matrix with the inherited accent",
  () => {
    expect(ACCEPTED_BASES.flatMap((base) => emittedMisses(serializeOpaqueOklch(base), {}, HEARTH_ACCENT))).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "every picked and inherited accent clears every tone's floors and tint separations on each contrast-case base",
  () => {
    const misses = BASES.flatMap(({ background }) =>
      ACCENTS.flatMap((accent) => [...emittedMisses(background, { accent }), ...emittedMisses(background, {}, accent)]),
    );
    expect(misses).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

/** A dark accent no one ink covers with its solid steps, and a saturated one past the gamut. */
const NESTED_ACCENTS = ["oklch(0.3 0.1 260)", "oklch(0.55 0.37 300)"] as const;

test(
  "an accent-only scope inside a carried palette paints primary roles that clear every D336 floor over the accepted-base matrix",
  () => {
    const misses = ACCEPTED_BASES.flatMap((base) => {
      const background = serializeOpaqueOklch(base);
      return NESTED_ACCENTS.flatMap((accent) => scopeMisses(nestedAccentScope(background, accent), `${background} nested accent ${accent}`));
    });
    expect(misses).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "the knob defaults miss on part of the matrix, so the solve is doing the work",
  () => {
    const missing = ACCEPTED_BASES.filter((base) => {
      const scheme = carriedToneScheme(carriedPaletteOf(parsed(serializeOpaqueOklch(base))));
      return carriedToneSources(scheme, parsed(HEARTH_ACCENT)).some(({ source }) => toneFloorMisses(scheme, source, TONE_MIX_DEFAULTS).length > 0);
    });
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(ACCEPTED_BASES.length);
  },
  SWEEP_TIMEOUT_MS,
);
