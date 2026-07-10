// The seed-palette + derived-output WCAG-AA enforcement gate (#16, part 3). Two failure classes this
// locks out of `pnpm test` (so neither needs a side-eye round to catch):
//   1. a STATIC seed token (tokens.json → theme.css) whose body-text pairing drops below AA 4.5:1;
//   2. a DERIVATION retune (clamp.ts THEME_DERIVATION) that pushes a derived foreground below AA on a
//      realistic light OR dark base.
// It recomputes every pairing in HOUSE oklch→sRGB math (no dependency) and reuses the WCAG contrast
// helpers the design-audit probe already owns. Translucent tokens (the --color-input field fill, 0.12α)
// are ALPHA-COMPOSITED over their backdrop before measuring — a naive contrast on an alpha value lies
// (the same reason snap.ts's --contrast grew compositeOver). The static values are read from the
// generated TOKENS map and the derivation constants from clamp.ts, so both are drift-free single sources.
import { TOKENS } from "@orb/ui/tokens";
import { THEME_DERIVATION } from "../../../../packages/ui/src/content/theme-scope/clamp";
import type { Rgb } from "../../../../scripts/probes/design-audit-checks";
import {
  contrastRatio,
  LARGE_MIN_RATIO,
  NORMAL_MIN_RATIO,
} from "../../../../scripts/probes/design-audit-checks";
import { expect, test } from "../../../support/fixtures";

// ── House oklch → sRGB (0–255). Standard OKLab matrices; channels clamped to gamut (neutral/low-chroma
// derived tones never clip, so this matches the browser's resolution of the emitted relative-color). ──
const OKLCH_RE = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/u;
interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}
function parseOklch(value: string): Oklch {
  const m = OKLCH_RE.exec(value);
  if (m === null) {
    throw new Error(`not an oklch() literal: ${value}`);
  }
  return {
    l: Number(m[1]),
    c: Number(m[2]),
    h: Number(m[3]),
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
function gammaEncode(linear: number): number {
  const c = clamp01(linear);
  return (c <= 0.003_130_8 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
}
function oklchToRgb({ l, c, h }: Pick<Oklch, "l" | "c" | "h">): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m_ = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s_ = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return {
    r: gammaEncode(4.076_741_662_1 * l_ - 3.307_711_591_3 * m_ + 0.230_969_929_2 * s_),
    g: gammaEncode(-1.268_438_004_6 * l_ + 2.609_757_401_1 * m_ - 0.341_319_396_5 * s_),
    b: gammaEncode(-0.004_196_086_3 * l_ - 0.703_418_614_7 * m_ + 1.707_614_701 * s_),
  };
}
/** Composite a translucent fg (its own alpha) over an opaque backdrop — the field-fill case. */
function compositeOver(fg: Oklch, backdrop: Rgb): Rgb {
  const f = oklchToRgb(fg);
  const a = fg.alpha;
  return {
    r: f.r * a + backdrop.r * (1 - a),
    g: f.g * a + backdrop.g * (1 - a),
    b: f.b * a + backdrop.b * (1 - a),
  };
}
const rgbOf = (path: keyof typeof TOKENS): Rgb => oklchToRgb(parseOklch(TOKENS[path].value));

// ── The clamp.ts derivation, recomputed numerically from the SHARED constants (THEME_DERIVATION). ──
// DELIBERATE formula mirror, NOT a call into clamp.ts: this suite tests a PROPERTY (WCAG contrast of the
// derived fg over every representative surface) that needs the numeric tone to compare against, so it
// re-spells the L-derivation. Drift between this mirror and the real derivation is fenced elsewhere —
// clamp.test.ts byte-pins clamp.ts's exact output — so the two can't silently diverge. Do NOT collapse this
// into `clamp.ts` (it would couple the property test to the impl and lose the independent cross-check).
const D = THEME_DERIVATION;
const clampN = (min: number, v: number, max: number): number => Math.max(min, Math.min(max, v));
const contrastToneL = (surfaceL: number): number =>
  clampN(D.fgLMin, (D.fgPivotL - surfaceL) * D.fgSteepness, D.fgLMax);
const mutedToneL = (surfaceL: number): number =>
  clampN(D.mutedLMin, (D.fgPivotL - surfaceL) * D.fgSteepness, D.mutedLMax);
/** A derived surface = the base with its L shifted by a ramp delta (chroma/hue kept, L clamped). */
const rampSurface = (base: Oklch, deltaL: number): Oklch => ({
  ...base,
  l: clamp01(base.l + deltaL),
});
/** The contrast foreground for `surface` (chroma 0, base hue). */
const foregroundRgb = (surface: Oklch): Rgb =>
  oklchToRgb({ l: contrastToneL(surface.l), c: 0, h: surface.h });

// Representative bases: dark themes sit at L ≤ 0.25 (Mocha 0.15, Hearth-projection 0.158), light at
// L ≥ 0.90 (Light 0.98). The mid band (~0.28–0.62) is the DOCUMENTED pivot limitation — a mid-gray page
// surface is inherently low-contrast for any sub-maximal tone (clamp.ts §muted-foreground), and no real
// palette uses one — so it is deliberately outside the swept range, not a gap.
const DARK_BASES = [
  "oklch(0.10 0.01 60)",
  "oklch(0.15 0.015 250)",
  "oklch(0.158 0.006 60)",
  "oklch(0.20 0.02 300)",
  "oklch(0.25 0.02 300)",
];
const LIGHT_BASES = ["oklch(0.90 0.01 60)", "oklch(0.95 0.01 60)", "oklch(0.98 0.004 75)"];
const REALISTIC_BASES = [...DARK_BASES, ...LIGHT_BASES];

// Real-world accents a user might pick (saturated, mid-high L — never a pivot-adjacent mid-gray): the
// three seed accents + a cool/warm spread. primary-foreground must stay legible on every one.
const ACCENTS = [
  "oklch(0.72 0.175 52)",
  "oklch(0.7 0.14 250)",
  "oklch(0.55 0.16 50)",
  "oklch(0.5 0.2 25)",
  "oklch(0.9 0.15 100)",
];

test("static seed tokens (theme.css :root) — every body-text pairing clears WCAG AA 4.5:1", () => {
  // Body/surface/secondary pairings must clear the normal-text floor.
  const bodyPairs: ReadonlyArray<readonly [keyof typeof TOKENS, keyof typeof TOKENS]> = [
    ["color.foreground", "color.background"],
    ["color.foreground", "color.card"],
    ["color.foreground", "color.surface-raised"],
    ["color.popover-foreground", "color.popover"],
    ["color.secondary-foreground", "color.secondary"],
    ["color.accent-foreground", "color.accent"],
    ["color.sidebar-foreground", "color.sidebar"],
    ["color.muted-foreground", "color.card"],
    ["color.muted-foreground", "color.muted"],
    ["color.system-bubble-foreground", "color.system-bubble"],
    ["color.narration", "color.ai-bubble"],
    ["color.narration", "color.user-bubble"],
    ["color.prose-body", "color.ai-bubble"],
    ["color.dialogue", "color.ai-bubble"],
  ];
  for (const [fg, bg] of bodyPairs) {
    const ratio = contrastRatio(rgbOf(fg), rgbOf(bg));
    expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
  // The muted foreground over the translucent input fill — composite the field over its darkest and
  // lightest realistic backdrops (popover is the lightest ramp surface — the worst case for the light
  // muted tone on a dark theme). This is the exact pairing the muted-foreground bump (0.705→0.74) fixed.
  const inputTok = parseOklch(TOKENS["color.input"].value);
  for (const backdrop of ["color.card", "color.popover", "color.background"] as const) {
    const composited = compositeOver(inputTok, rgbOf(backdrop));
    const ratio = contrastRatio(rgbOf("color.muted-foreground"), composited);
    expect(ratio, `muted-foreground on input over ${backdrop}`).toBeGreaterThanOrEqual(
      NORMAL_MIN_RATIO,
    );
  }
});

test("static seed tokens — solid semantic-intent surfaces clear the 3:1 UI/large-text floor", () => {
  // destructive/success/warning/highlight/primary are SOLID accent buttons+badges (medium/bold labels =
  // the WCAG large-text carve). destructive is the deliberately-accepted 3.65:1 (UIP-101 kept the seed
  // value as the better of two sub-AA-normal options); the rest clear 4.5 comfortably.
  const buttonPairs: ReadonlyArray<readonly [keyof typeof TOKENS, keyof typeof TOKENS]> = [
    ["color.primary-foreground", "color.primary"],
    ["color.destructive-foreground", "color.destructive"],
    ["color.success-foreground", "color.success"],
    ["color.warning-foreground", "color.warning"],
    ["color.highlight-foreground", "color.highlight"],
  ];
  for (const [fg, bg] of buttonPairs) {
    const ratio = contrastRatio(rgbOf(fg), rgbOf(bg));
    expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(LARGE_MIN_RATIO);
  }
});

test("clamp DERIVED neutral chrome clears AA on every realistic light + dark base", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const fg = foregroundRgb(base); // the one derived --color-foreground, used on every neutral surface
    // Every neutral ramp surface whose text is the plain derived foreground: card/popover/sidebar/
    // secondary (secondary-foreground = foreground) + sidebar-accent (its text is sidebar-foreground =
    // foreground; the rail-hover pairing, owner defect #2). All must clear AA on any realistic base.
    const surfaces = {
      background: base,
      card: rampSurface(base, D.ramp.card),
      popover: rampSurface(base, D.ramp.popover),
      sidebar: rampSurface(base, D.ramp.sidebar),
      secondary: rampSurface(base, D.ramp.secondary),
      "sidebar-accent": rampSurface(base, D.ramp.sidebarAccent),
    };
    for (const [name, surface] of Object.entries(surfaces)) {
      const ratio = contrastRatio(fg, oklchToRgb(surface));
      expect(ratio, `derived foreground on ${name} @ ${baseStr}`).toBeGreaterThanOrEqual(
        NORMAL_MIN_RATIO,
      );
    }
    // Muted foreground over the derived input fill (contrast tone at inputAlpha) composited over the
    // lightest (popover) and base surfaces — the worst realistic backdrops — PLUS the opaque derived
    // `muted` surface it labels directly (badges/skeleton text). All clear the normal-text floor.
    const inputFill: Oklch = { l: contrastToneL(base.l), c: 0, h: base.h, alpha: D.inputAlpha };
    const muted = oklchToRgb({ l: mutedToneL(base.l), c: 0, h: base.h });
    for (const [name, surface] of [
      ["popover", surfaces.popover],
      ["background", base],
    ] as const) {
      const ratio = contrastRatio(muted, compositeOver(inputFill, oklchToRgb(surface)));
      expect(
        ratio,
        `derived muted-foreground on input over ${name} @ ${baseStr}`,
      ).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
    const mutedSurface = rampSurface(base, D.ramp.muted);
    expect(
      contrastRatio(muted, oklchToRgb(mutedSurface)),
      `derived muted-foreground on muted @ ${baseStr}`,
    ).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

test("clamp DERIVED accent (hover/selected) surface + its foreground clear AA on every realistic base", () => {
  // The P2 pairing: a selected list-row's title (accent-foreground) on the derived accent surface must
  // stay legible under any theme — the light-theme quick-pick case that was illegible when accent stayed
  // the static dark tone under a light base.
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const accent = rampSurface(base, D.ramp.accent);
    const accentFg = oklchToRgb({ l: contrastToneL(base.l + D.ramp.accent), c: 0, h: base.h });
    const ratio = contrastRatio(accentFg, oklchToRgb(accent));
    expect(ratio, `derived accent-foreground on accent @ ${baseStr}`).toBeGreaterThanOrEqual(
      NORMAL_MIN_RATIO,
    );
  }
});

test("clamp DERIVED primary-foreground clears AA on every realistic picked accent", () => {
  for (const accentStr of ACCENTS) {
    const accent = parseOklch(accentStr);
    const primaryFg = foregroundRgb(accent);
    const ratio = contrastRatio(primaryFg, oklchToRgb(accent));
    expect(ratio, `derived primary-foreground on accent ${accentStr}`).toBeGreaterThanOrEqual(
      NORMAL_MIN_RATIO,
    );
  }
});
