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
import { READING_BAND_ALPHA, readingBandSurface, readingPlateAlpha, shadowIngredients } from "@orb/kit/theme-derivation";
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { contrastRatio, LARGE_MIN_RATIO, NORMAL_MIN_RATIO } from "@orb/tooling/_shared/wcag";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens, THEME_DERIVATION } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { expect, test } from "../../../support/fixtures.ts";

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

// ── Per-seed-palette intent-token sweep (W2). The 9 semantic-intent tokens are POLARITY-AWARE
// `light-dark(<light-arm>, <dark-arm>)` values (light arm FIRST per CSS syntax) — one static token, two
// hand-tuned arms selected by the inherited color-scheme. A single static value physically cannot clear
// AA-NORMAL 4.5:1 as text on BOTH a near-black and a near-white surface, so we assert the CORRECT arm per
// palette. The palette list is DERIVED from SEED_THEME_VALUE_SETS (never a hand list) + the base Hearth
// palette, so a future third value-set is auto-covered. ──
const LIGHT_DARK_RE = /^light-dark\(\s*(.+?)\s*,\s*(.+)\s*\)$/u;
/** The matching arm of a `light-dark(<light>, <dark>)` value (light FIRST), or the value itself for a plain oklch. */
function resolveArm(value: string, scheme: "light" | "dark"): string {
  const m = LIGHT_DARK_RE.exec(value);
  if (m === null) {
    return value;
  }
  return scheme === "light" ? (m[1] ?? value) : (m[2] ?? value);
}
interface Palette {
  readonly name: string;
  readonly colorScheme: "light" | "dark";
  /** Value-set overrides (`--color-*` → oklch); intent tokens are NOT overridden, so they fall to base TOKENS. */
  readonly vars: Readonly<Record<string, string>>;
}
// Hearth = the base TOKENS themselves (no value-set), dark scheme. The seed value-sets follow.
const PALETTES: readonly Palette[] = [
  { name: "hearth", colorScheme: "dark", vars: {} },
  ...Object.entries(SEED_THEME_VALUE_SETS).map(([name, set]): Palette => ({ name, colorScheme: set.colorScheme, vars: set.vars })),
];
/** A token resolved IN a palette: the value-set override if present, else the base token — then the
 *  light-dark() arm picked by the palette's color-scheme (a plain oklch passes through resolveArm). */
function resolveTokenRgb(path: keyof typeof TOKENS, palette: Palette): Rgb {
  const raw = palette.vars[TOKENS[path].cssVar] ?? TOKENS[path].value;
  return oklchToRgb(parseOklch(resolveArm(raw, palette.colorScheme)));
}

// Text-role intents (rendered AS `text-*`): destructive/success/warning + info. highlight is a text-mark
// BACKGROUND (never text), so it is pill-only below. The surfaces every intent text sits on.
const INTENT_TEXT_SURFACES = ["color.background", "color.card", "color.popover"] as const;
const INTENT_TEXT_TOKENS = ["color.destructive", "color.success", "color.warning", "color.info"] as const;
// Pill-role intents (solid `bg-*` + its `text-*-foreground`). info gained its foreground in north-star
// PP1, so it is BOTH text (above) and a pill (here); highlight is pill-only (background mark).
const INTENT_PILL_PAIRS = [
  ["color.destructive", "color.destructive-foreground"],
  ["color.success", "color.success-foreground"],
  ["color.warning", "color.warning-foreground"],
  ["color.info", "color.info-foreground"],
  ["color.highlight", "color.highlight-foreground"],
] as const;

// ── The clamp.ts derivation, recomputed numerically from the SHARED constants (THEME_DERIVATION). ──
// DELIBERATE formula mirror, NOT a call into clamp.ts: this suite tests a PROPERTY (WCAG contrast of the
// derived fg over every representative surface) that needs the numeric tone to compare against, so it
// re-spells the L-derivation. Drift between this mirror and the real derivation is fenced elsewhere —
// clamp.test.ts byte-pins clamp.ts's exact output — so the two can't silently diverge. Do NOT collapse this
// into `clamp.ts` (it would couple the property test to the impl and lose the independent cross-check).
const D = THEME_DERIVATION;
const clampN = (min: number, v: number, max: number): number => Math.max(min, Math.min(max, v));
const contrastToneL = (surfaceL: number): number => clampN(D.fgLMin, (D.fgPivotL - surfaceL) * D.fgSteepness, D.fgLMax);
const mutedToneL = (surfaceL: number): number => clampN(D.mutedLMin, (D.fgPivotL - surfaceL) * D.fgSteepness, D.mutedLMax);
/** A derived surface = the base with its L shifted by a ramp delta (chroma/hue kept, L clamped). */
const rampSurface = (base: Oklch, deltaL: number): Oklch => ({
  ...base,
  l: clamp01(base.l + deltaL),
});
/** The contrast foreground for `surface` (chroma 0, base hue). */
const foregroundRgb = (surface: Oklch): Rgb => oklchToRgb({ l: contrastToneL(surface.l), c: 0, h: surface.h });

// Representative bases: dark themes sit at L ≤ 0.25 (Mocha 0.15, Hearth-projection 0.158), light at
// L ≥ 0.90 (Light 0.98). The mid band (~0.28–0.62) is the DOCUMENTED pivot limitation — a mid-gray page
// surface is inherently low-contrast for any sub-maximal tone (clamp.ts §muted-foreground), and no real
// palette uses one — so it is deliberately outside the swept range, not a gap.
const DARK_BASES = ["oklch(0.10 0.01 60)", "oklch(0.15 0.015 250)", "oklch(0.158 0.006 60)", "oklch(0.20 0.02 300)", "oklch(0.25 0.02 300)"];
const LIGHT_BASES = ["oklch(0.90 0.01 60)", "oklch(0.95 0.01 60)", "oklch(0.98 0.004 75)"];
const REALISTIC_BASES = [...DARK_BASES, ...LIGHT_BASES];

// Real-world accents a user might pick (saturated, mid-high L — never a pivot-adjacent mid-gray): the
// three seed accents + a cool/warm spread. primary-foreground must stay legible on every one.
const ACCENTS = ["oklch(0.72 0.175 52)", "oklch(0.7 0.14 250)", "oklch(0.55 0.16 50)", "oklch(0.5 0.2 25)", "oklch(0.9 0.15 100)"];

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
    expect(ratio, `muted-foreground on input over ${backdrop}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

test("static PRIMARY solid surface clears the 3:1 UI/large-text floor", () => {
  // primary is a SOLID accent button+badge (medium/bold label = the WCAG large-text carve). The semantic
  // INTENTS (destructive/success/warning/highlight) are no longer asserted here — they are polarity-aware
  // light-dark() tokens now swept per-palette at the stronger AA-NORMAL 4.5:1 floor in the test below.
  const ratio = contrastRatio(rgbOf("color.primary-foreground"), rgbOf("color.primary"));
  expect(ratio, "primary-foreground on primary").toBeGreaterThanOrEqual(LARGE_MIN_RATIO);
});

test.each(
  PALETTES.map((p) => [p.name, p] as const),
)("intent tokens clear WCAG AA-NORMAL 4.5:1 (correct light-dark arm) on the %s palette — text on bg/card/popover + pill", (_name, palette) => {
  // role 1 — `text-*` (validation label / status text) on every chrome surface the intent can sit on
  // (background/card/popover). highlight is excluded — it is a text-mark BACKGROUND, never text.
  for (const intent of INTENT_TEXT_TOKENS) {
    const fg = resolveTokenRgb(intent, palette);
    for (const surface of INTENT_TEXT_SURFACES) {
      const ratio = contrastRatio(fg, resolveTokenRgb(surface, palette));
      expect(ratio, `${intent} as text on ${surface} @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
  }
  // role 2 — the solid `bg-*` + `text-*-foreground` pill (destructive/success/warning/info/highlight).
  // Subsumes the former Hearth-only destructive special-case across ALL palettes.
  for (const [bg, foreground] of INTENT_PILL_PAIRS) {
    const ratio = contrastRatio(resolveTokenRgb(foreground, palette), resolveTokenRgb(bg, palette));
    expect(ratio, `${foreground} on ${bg} (pill) @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
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
      expect(ratio, `derived foreground on ${name} @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
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
      expect(ratio, `derived muted-foreground on input over ${name} @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
    const mutedSurface = rampSurface(base, D.ramp.muted);
    expect(contrastRatio(muted, oklchToRgb(mutedSurface)), `derived muted-foreground on muted @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
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
    expect(ratio, `derived accent-foreground on accent @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

test("clamp-derived colorScheme AGREES with each realistic base's polarity (closes the light-dark loop)", () => {
  // The AA sweeps above resolve each intent token's light-dark() arm by a base's polarity. Under a CUSTOM
  // theme, that arm is chosen by the color-scheme the clamp DERIVES from the picked background — so the
  // derivation must land on the same polarity the AA math assumed, or a custom light theme would resolve
  // dark arms (the exact illegibility W2's arms fixed). Prove the two agree for every realistic base.
  for (const baseStr of LIGHT_BASES) {
    expect(clampThemeTokens({ background: baseStr }).colorScheme, `${baseStr} is a LIGHT base`).toBe("light");
  }
  for (const baseStr of DARK_BASES) {
    expect(clampThemeTokens({ background: baseStr }).colorScheme, `${baseStr} is a DARK base`).toBe("dark");
  }
});

test("clamp DERIVED primary-foreground clears AA on every realistic picked accent", () => {
  for (const accentStr of ACCENTS) {
    const accent = parseOklch(accentStr);
    const primaryFg = foregroundRgb(accent);
    const ratio = contrastRatio(primaryFg, oklchToRgb(accent));
    expect(ratio, `derived primary-foreground on accent ${accentStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

// ── #204: THE READING PLATE (`--color-reading-plate`) — derived, never designed, and a PROVEN floor ──
// The transcript's over-art text backing. Three properties, each a machine invariant:
//   1. every shipped palette's plate literal IS the derivation (background + readingPlate.deltaL at
//      `readingPlateAlpha(background)`, polarity-aware since #217) to the digit — a hand-retuned plate
//      that drifts off its base is the #204 surface/ink divorce reborn;
//   2. the alpha is a FLOOR, not a taste call: the palette's derived foreground clears AA-NORMAL over
//      the plate composited over WORST-CASE art (pure black AND pure white — `backgroundDim` can be 0,
//      so raw art is the legal worst case), for every shipped palette and every realistic custom base
//      (measured pre-pin at alpha 0.65: worst 4.88, over the 0.25-L base + black art);
//   3. every shipped palette's four AUTHOR-STYLE prose inks (dialogue/narration/prose-body/speaker)
//      clear AA against their own base — the §7a "sensible card" criterion, proving the clamp is a
//      byte-identical no-op on every palette we ship (measured pre-pin: min 6.02, light speaker).
const READING_PLATE_PATH = "color.reading-plate" as const;
const PROSE_INK_PATHS = ["color.dialogue", "color.narration", "color.prose-body", "color.speaker"] as const;
const WORST_ART: ReadonlyArray<readonly [name: string, rgb: Rgb]> = [
  ["black art", { r: 0, g: 0, b: 0 }],
  ["white art", { r: 255, g: 255, b: 255 }],
];
/** The plate the clamp would derive for `base` — L shifted, hue/chroma kept, the plate's own alpha.
 *  The ALPHA is CALLED, not mirrored (#217): unlike the L-derivations above it is a solved minimum, not a
 *  formula, and a second search loop here would be a copy of the impl rather than an independent
 *  cross-check. What keeps it honest is that the two properties below measure the SHIPPED literals. */
function derivedPlate(base: Oklch): Oklch {
  return { ...rampSurface(base, D.readingPlate.deltaL), alpha: readingPlateAlpha(base) };
}

test.each(PALETTES.map((p) => [p.name, p] as const))("#204 %s: the reading-plate literal IS derive(background) to the digit", (_name, palette) => {
  const plate = parseOklch(palette.vars[TOKENS[READING_PLATE_PATH].cssVar] ?? TOKENS[READING_PLATE_PATH].value);
  const base = parseOklch(palette.vars[TOKENS["color.background"].cssVar] ?? TOKENS["color.background"].value);
  expect(plate.l, "plate L = base L + readingPlate.deltaL").toBeCloseTo(clamp01(base.l + D.readingPlate.deltaL), 3);
  expect(plate.c, "plate chroma = base chroma").toBeCloseTo(base.c, 4);
  expect(plate.h, "plate hue = base hue").toBeCloseTo(base.h, 4);
  expect(plate.alpha, "plate alpha = readingPlateAlpha(background)").toBeCloseTo(readingPlateAlpha(base), 4);
});

// ── #241: THE STICKY ATTRIBUTION BAND (`--color-reading-band`) — the plate's colour at alpha 1 ──
// The band pins a tall turn's speaker name over that turn's OWN prose, so it stays OPAQUE (#168). What
// #241 rules is its COLOUR: it shipped as the `card` ramp surface while the prose under it rides the
// plate, a constant ΔL ≈ 0.085 step down one column. Two properties, and the first is the ruling:
//   1. every shipped palette's band literal IS the plate's colour (readingBandSurface(background)) — so
//      the step is not "matched", it cannot exist;
//   2. the band's paired ink (the base's derived foreground, `text-foreground`) clears AA on it — the
//      band is opaque, so unlike the plate there is no art in this composite and no alpha to solve.
const READING_BAND_PATH = "color.reading-band" as const;

test.each(PALETTES.map((p) => [p.name, p] as const))("#241 %s: the reading-band literal IS the plate's colour at alpha 1", (_name, palette) => {
  const band = parseOklch(palette.vars[TOKENS[READING_BAND_PATH].cssVar] ?? TOKENS[READING_BAND_PATH].value);
  const plate = parseOklch(palette.vars[TOKENS[READING_PLATE_PATH].cssVar] ?? TOKENS[READING_PLATE_PATH].value);
  const base = parseOklch(palette.vars[TOKENS["color.background"].cssVar] ?? TOKENS["color.background"].value);
  const derived = readingBandSurface(base);
  expect(band.l, "band L = readingBandSurface(background).l").toBeCloseTo(derived.l, 3);
  expect(band.c, "band chroma = base chroma").toBeCloseTo(derived.c, 4);
  expect(band.h, "band hue = base hue").toBeCloseTo(derived.h, 4);
  // THE STEP, stated as an equality against the OTHER shipped literal rather than only against the
  // formula: the two tokens a message column stacks must be one colour.
  expect(band.l, "band L = plate L — the #223 step, gone by construction").toBeCloseTo(plate.l, 3);
  expect(band.c).toBeCloseTo(plate.c, 4);
  expect(band.h).toBeCloseTo(plate.h, 4);
  // …differing ONLY in alpha (#168 untouched). Non-vacuous on every shipped palette: the plate is a window.
  expect(band.alpha, "the band is opaque").toBe(READING_BAND_ALPHA);
  expect(plate.alpha, "…and the plate is not (or there was no step to kill)").toBeLessThan(READING_BAND_ALPHA);
});

test("#241 the band's paired ink (the derived foreground) clears AA on the band, every realistic base", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const ratio = contrastRatio(foregroundRgb(base), oklchToRgb(readingBandSurface(base)));
    expect(ratio, `derived foreground on the band @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

test("#204 the plate alpha FLOORS AA for the derived foreground over worst-case art on every realistic base", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const fg = foregroundRgb(base);
    const plate = derivedPlate(base);
    for (const [artName, art] of WORST_ART) {
      const ratio = contrastRatio(fg, compositeOver(plate, art));
      expect(ratio, `derived foreground over plate over ${artName} @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
  }
});

// ── #217: THE PROSE INKS OVER THE PLATE OVER ART — the arm the "proven alpha floor" never covered ──
// The test above proves the DERIVED foreground (the near-black/near-white pivot flip) over the plate over
// worst-case art. The four AUTHOR-STYLE prose inks are NOT that foreground — they sit between the base and
// the derived tone — and they are what a transcript is actually made of. Measured live 2026-08-18 (the
// chats re-score, `reports/design/rescore-chats-2026-08-18.md`): the light-palette room read narration
// 3.48:1 / dialogue 4.09:1 over the bright regions of its wallpaper while the SAME ink measured 4.94/5.39
// parked over the dark regions — the plate's alpha, not the ink, was the variable.
//
// WHICH ART IS THE WORST CASE IS A FUNCTION OF THE PLATE'S POLARITY, and the intuition runs backwards: a
// LIGHT plate carries DARK inks, so the composite is worst when the art DARKENS it ⇒ BLACK art. A DARK
// plate carries LIGHT inks ⇒ WHITE art. `backgroundDim` can be 0 (`BACKGROUND_DIM_MIN`), so raw art is
// legal and both extremes are reachable.
//
// THE DARK-PLATE × WHITE-ART PAIR IS A STATED, OWNER-RULED EXEMPTION, not an oversight. D144(d): "Inks are
// guaranteed vs their BASE, not worst-case art pixels — closing that would move the sacred dark rooms
// (owner-adjacent, refused)", and #217 re-states it as the fix's hard constraint ("Dark plates keep 0.65").
// Measured at the shipped 0.65 (this file's own math, 2026-08-18): hearth speaker 2.51 · narration 3.29 ·
// dialogue 4.29; mocha speaker 2.50 · narration 3.12 · dialogue 4.12 — i.e. the dark plates carry the SAME
// defect over bright art, and closing it needs alpha 0.86, which is exactly the sacred-room move the owner
// refused. The exemption is recorded here so the next reader finds the numbers, not a silent gap.
const GUARANTEED_ART = {
  light: ["black art", "white art"],
  dark: ["black art"],
} as const satisfies Record<"light" | "dark", readonly string[]>;

test.each(
  PALETTES.map((p) => [p.name, p] as const),
)("#217 %s: the four prose inks clear AA over the plate composited over worst-case art (the guaranteed arts)", (_name, palette) => {
  const plate = parseOklch(palette.vars[TOKENS[READING_PLATE_PATH].cssVar] ?? TOKENS[READING_PLATE_PATH].value);
  for (const [artName, art] of WORST_ART) {
    if (!GUARANTEED_ART[palette.colorScheme].includes(artName)) {
      continue;
    }
    const composited = compositeOver(plate, art);
    for (const ink of PROSE_INK_PATHS) {
      const ratio = contrastRatio(resolveTokenRgb(ink, palette), composited);
      expect(ratio, `${ink} over the plate over ${artName} @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
  }
});

// ── #243: THE ELEVATION INGREDIENTS — polarity-derived, so a CUSTOM light theme stops wearing dark smoke ──
const SHADOW_HAIRLINE_VAR = "--color-shadow-hairline";
const SHADOW_AMBIENT_FAR_VAR = "--color-shadow-ambient-far";
/** The emitted relative-colour ingredient RESOLVED against its base — `oklch(from <base> L C h / A)` with
 *  the base's hue substituted, i.e. exactly what the browser computes, then composited over the base. */
const RELATIVE_INGREDIENT_RE = /^oklch\(from .+? ([\d.]+) ([\d.]+) h \/ ([\d.]+)\)$/u;
function resolvedIngredientOver(emitted: string | undefined, base: Oklch): Rgb {
  const m = RELATIVE_INGREDIENT_RE.exec(emitted ?? "");
  if (m === null) {
    throw new Error(`not an emitted relative-colour ingredient: ${String(emitted)}`);
  }
  const ingredient: Oklch = { l: Number(m[1]), c: Number(m[2]), h: base.h, alpha: Number(m[3]) };
  return compositeOver(ingredient, oklchToRgb(base));
}

/** The five ingredient token paths, paired with the derivation role each must equal. */
const SHADOW_INGREDIENT_PATHS = [
  ["color.shadow-hairline", "hairline"],
  ["color.shadow-highlight", "highlight"],
  ["color.shadow-ambient-near", "ambientNear"],
  ["color.shadow-ambient-far", "ambientFar"],
  ["color.shadow-cta-highlight", "ctaHighlight"],
] as const satisfies ReadonlyArray<readonly [keyof typeof TOKENS, keyof ReturnType<typeof shadowIngredients>]>;

test.each(PALETTES.map((p) => [p.name, p] as const))("#243 %s: the five elevation-ingredient literals ARE shadowIngredients(background)", (_name, palette) => {
  const base = parseOklch(palette.vars[TOKENS["color.background"].cssVar] ?? TOKENS["color.background"].value);
  const derived = shadowIngredients(base);
  for (const [path, role] of SHADOW_INGREDIENT_PATHS) {
    const shipped = parseOklch(palette.vars[TOKENS[path].cssVar] ?? TOKENS[path].value);
    const want = derived[role];
    expect(shipped.l, `${path} L @ ${palette.name}`).toBeCloseTo(want.l, 4);
    expect(shipped.c, `${path} chroma @ ${palette.name}`).toBeCloseTo(want.c, 4);
    expect(shipped.alpha, `${path} alpha @ ${palette.name}`).toBeCloseTo(want.alpha, 4);
    // Hue is asserted through the RENDERED colour rather than the number, because hue is POWERLESS at
    // chroma 0: the dark arm is pure white/black, so its shipped literals spell hue 0 while the
    // derivation carries the palette's — identical pixels, and the reason the dark rooms cannot move.
    // Where the arm HAS chroma (the light arm's warm hairline/ambient) this pins the hue to the palette's.
    const shippedRgb = oklchToRgb(shipped);
    const wantRgb = oklchToRgb(want);
    expect([shippedRgb.r, shippedRgb.g, shippedRgb.b], `${path} renders the derivation's colour @ ${palette.name}`).toEqual([
      expect.closeTo(wantRgb.r, 3),
      expect.closeTo(wantRgb.g, 3),
      expect.closeTo(wantRgb.b, 3),
    ]);
  }
});

test("#243 the derived hairline ring falls on the CORRECT side of the base — light-from-above on dark, a dark ring on light", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const ring = resolvedIngredientOver(clampThemeTokens({ background: baseStr }).vars[SHADOW_HAIRLINE_VAR], base);
    const baseRgb = oklchToRgb(base);
    // Luminance, not a channel: the ring must READ as edge light on a dark surface and as a hairline
    // border on a light one. The pre-#243 inherited dark recipe is a WHITE ring on a light base — the
    // 1.29:1 ghost #232 measured — so this assertion is the defect, stated directionally.
    const brighter = contrastRatio(ring, baseRgb) > 1 && ring.r > baseRgb.r;
    expect(brighter, `hairline ring lighter than the base @ ${baseStr}`).toBe(base.l <= D.fgPivotL);
  }
});

test("#243 the derived ingredients BEAT the inherited dark recipe on the two properties #232 measured", () => {
  // Not a floor pulled out of the air: on every realistic LIGHT base the derivation must make the ring
  // MORE visible and the ambient drop LESS heavy than the base-theme (dark) recipe a custom light theme
  // inherited before #243. Measured at the shipped values: ring 1.00-1.02 -> 1.32-1.34, far ambient
  // 3.73-3.93 (a black halo, the "sticker" side-eye finding) -> 1.26-1.27.
  const inheritedHairline = parseOklch(TOKENS["color.shadow-hairline"].value);
  const inheritedAmbientFar = parseOklch(TOKENS["color.shadow-ambient-far"].value);
  for (const baseStr of LIGHT_BASES) {
    const base = parseOklch(baseStr);
    const baseRgb = oklchToRgb(base);
    const { vars } = clampThemeTokens({ background: baseStr });
    const inheritedRing = compositeOver(inheritedHairline, baseRgb);
    const derivedRing = resolvedIngredientOver(vars[SHADOW_HAIRLINE_VAR], base);
    expect(contrastRatio(derivedRing, baseRgb), `ring visibility @ ${baseStr}`).toBeGreaterThan(contrastRatio(inheritedRing, baseRgb));
    const inheritedDrop = compositeOver(inheritedAmbientFar, baseRgb);
    const derivedDrop = resolvedIngredientOver(vars[SHADOW_AMBIENT_FAR_VAR], base);
    expect(contrastRatio(derivedDrop, baseRgb), `ambient weight @ ${baseStr}`).toBeLessThan(contrastRatio(inheritedDrop, baseRgb));
    // …and the drop is still a DROP: an ambient layer darkens its surroundings on either polarity.
    expect(derivedDrop.r, `the ambient drop darkens @ ${baseStr}`).toBeLessThan(baseRgb.r);
  }
});

test.each(PALETTES.map((p) => [p.name, p] as const))("#204 %s: the four prose inks clear AA on their own base (the §7a no-op criterion)", (_name, palette) => {
  const baseRgb = resolveTokenRgb("color.background", palette);
  for (const ink of PROSE_INK_PATHS) {
    const ratio = contrastRatio(resolveTokenRgb(ink, palette), baseRgb);
    expect(ratio, `${ink} on background @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});
