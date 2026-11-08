// D336: what the ThemeScope clamp emits for a carried background clears every tone's floors on every host, primary
// included, for picked and inherited accents, and keeps each tint off every host and off every tint of a non-adjacent hue. Each case
// reads the emitted variables back, knobs and literals, and judges the pixels they spell.
import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NORMAL_RATIO, oklchToSrgb, rampDeltas, rampSurface, srgbToOklch, toneContrast, toneFloorMisses } from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ToneRole } from "@orb/ui/tokens";
import { TOKEN_POLARITY_ARMS, TOKENS, TONE_MIX_DEFAULTS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { serializeOpaqueOklch, toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { carriedPaletteOf } from "../../../../packages/ui/src/content/theme-scope/derive-vars.ts";
import { carriedToneScheme, carriedToneSources } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { keepsHue, MID_GREY } from "./contrast-cases.ts";
import {
  emittedInk,
  emittedLiterals,
  emittedMisses,
  emittedMix,
  emittedScope,
  HEARTH_ACCENT,
  hueAdjacent,
  nestedAccentScope,
  paintedRoles,
  parsed,
  scopeMisses,
} from "./tone-scope-misses.ts";

// The sweeps run the production clamp per case; they outrun the default per-test budget.
const SWEEP_TIMEOUT_MS = 180_000;

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

test("on a mid-grey page every colored tone's text, text on its tint, tint and solid keep its hue", () => {
  const { scheme, vars, tones } = emittedScope(MID_GREY, {}, HEARTH_ACCENT);
  const lost = tones.flatMap((carried) => {
    if (carried.source === "neutral") {
      return [];
    }
    const { base } = carried.source;
    const roles = paintedRoles(scheme, vars, carried);
    return (["solid", "text", "text-on-tint", "tint", "tint-active"] as const satisfies readonly ToneRole[]).flatMap((role) => {
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
  expect(vars[TOKENS["color.primary"].cssVar]).not.toBe(authored);
  expect(toOklch(vars[TOKENS["color.primary"].cssVar] ?? "")?.inGamut).toBe(true);
  expect(emittedMisses("oklch(0.158 0.006 60)", { accent: authored })).toEqual([]);
});

test(
  "every colored tone's text and the page ink clear AA on the popover and the sidebar they are painted on",
  () => {
    const misses = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).flatMap((background) => {
      const base = parsed(background);
      const deltas = rampDeltas(base);
      const hosts = { popover: rampSurface(base, deltas.popover), sidebar: rampSurface(base, deltas.sidebar) };
      const { vars, tones } = emittedScope(background, {}, HEARTH_ACCENT);
      const inks = [
        { name: "foreground", ink: emittedInk(vars[TOKENS["color.foreground"].cssVar]) },
        ...tones.flatMap(({ tone }) => {
          const ink = emittedLiterals(vars, tone).text;
          return ink === undefined ? [] : [{ name: tone, ink }];
        }),
      ];
      return Object.entries(hosts).flatMap(([host, surface]) =>
        inks.flatMap(({ name, ink }) => {
          const ratio = toneContrast({ ...ink, h: ink.c === 0 ? base.h : ink.h }, surface);
          return ratio >= AA_NORMAL_RATIO ? [] : [`${background} ${name} on ${host} ${ratio.toFixed(3)}`];
        }),
      );
    });
    expect(misses).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "every tone clears every D336 floor and every tint its separation over the accepted-base matrix with the inherited accent",
  () => {
    expect(ACCEPTED_BASES.flatMap((base) => emittedMisses(serializeOpaqueOklch(base), {}, HEARTH_ACCENT))).toEqual([]);
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
