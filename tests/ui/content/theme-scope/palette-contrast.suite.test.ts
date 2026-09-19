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
import { BACKGROUND_DIM_MIN } from "@orb/contracts/settings/appearance";
import type { RampDeltas } from "@orb/kit/theme-derivation";
import {
  AA_NORMAL_DERIVATION_RATIO,
  derivedForegroundLightness,
  READING_BAND_ALPHA,
  rampDeltas,
  readingBandSurface,
  readingPlateAlpha,
  readingPlateForeground,
  shadowIngredients,
  surfacePolarity,
} from "@orb/kit/theme-derivation";
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { contrastRatio, LARGE_MIN_RATIO, NORMAL_MIN_RATIO, UI_COMPONENT_MIN_RATIO } from "@orb/tooling/_shared/wcag";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens, THEME_DERIVATION } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { compositedBase } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
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

// ── The clamp.ts derivation, measured from its emitted product. ─────────────────────────────────────
const D = THEME_DERIVATION;
/** A derived surface = the base with its L shifted by a ramp delta (chroma/hue kept, L clamped). */
const rampSurface = (base: Oklch, deltaL: number): Oklch => ({
  ...base,
  l: clamp01(base.l + deltaL),
});
/** The ramp deltas for a base — CALLED, not mirrored (#682), because a second copy of the polarity
 *  selection would be the implementation pasted into its own test. */
const rampOf = (base: Oklch): RampDeltas => rampDeltas(base);
/** The contrast foreground for `surface` (chroma 0, base hue). */
const foregroundRgb = (surface: Oklch): Rgb => oklchToRgb({ l: derivedForegroundLightness(surface), c: 0, h: surface.h });

// Representative bases for the prose/chrome guarantees below. The chart ramp has its own exhaustive
// accepted-base sweep because categorical fills can be driven to either side of a mid-tone surface even
// where the softer text/chrome derivations deliberately do not claim a floor.
const DARK_BASES = ["oklch(0.10 0.01 60)", "oklch(0.15 0.015 250)", "oklch(0.158 0.006 60)", "oklch(0.20 0.02 300)", "oklch(0.25 0.02 300)"];
const LIGHT_BASES = ["oklch(0.62 0.01 60)", "oklch(0.6201 0.01 60)", "oklch(0.90 0.01 60)", "oklch(0.95 0.01 60)", "oklch(0.98 0.004 75)"];
const REALISTIC_BASES = [...DARK_BASES, ...LIGHT_BASES];

// Real-world accents a user might pick (saturated, mid-high L — never a pivot-adjacent mid-gray): the
// three seed accents + a cool/warm spread. primary-foreground must stay legible on every one.
const ACCENTS = ["oklch(0.72 0.175 52)", "oklch(0.7 0.14 250)", "oklch(0.55 0.16 50)", "oklch(0.5 0.2 25)", "oklch(0.9 0.15 100)"];

test.each(PALETTES.map((palette) => [palette.name, palette] as const))("static %s seed neutral pairs carry the framebuffer render margin", (_name, palette) => {
  // Body/surface/secondary pairings must carry the solver's above-AA render target.
  const bodyPairs: ReadonlyArray<readonly [keyof typeof TOKENS, keyof typeof TOKENS]> = [
    ["color.foreground", "color.background"],
    ["color.foreground", "color.card"],
    ["color.foreground", "color.surface-raised"],
    ["color.popover-foreground", "color.popover"],
    ["color.secondary-foreground", "color.secondary"],
    ["color.accent-foreground", "color.accent"],
    ["color.sidebar-foreground", "color.sidebar"],
    ["color.sidebar-accent-foreground", "color.sidebar-accent"],
    ["color.reading-plate-foreground", "color.reading-band"],
    ["color.muted-foreground", "color.card"],
    ["color.muted-foreground", "color.muted"],
    ["color.system-bubble-foreground", "color.system-bubble"],
    ["color.narration", "color.ai-bubble"],
    ["color.narration", "color.user-bubble"],
    ["color.prose-body", "color.ai-bubble"],
    ["color.dialogue", "color.ai-bubble"],
  ];
  for (const [fg, bg] of bodyPairs) {
    const ratio = worstContrast(resolveTokenRgb(fg, palette), resolveTokenRgb(bg, palette));
    expect(ratio, `${fg} on ${bg} @ ${palette.name}`).toBeGreaterThanOrEqual(AA_NORMAL_DERIVATION_RATIO);
  }
  // The muted foreground over the translucent input fill — composite the field over its darkest and
  // lightest realistic backdrops (popover is the lightest ramp surface — the worst case for the light
  // muted tone on a dark theme). This is the exact family the Mocha framebuffer miss exposed.
  const inputTok = resolveTokenOklch("color.input", palette);
  for (const backdrop of ["color.card", "color.popover", "color.background"] as const) {
    const composited = compositeOver(inputTok, resolveTokenRgb(backdrop, palette));
    const ratio = worstContrast(resolveTokenRgb("color.muted-foreground", palette), composited);
    expect(ratio, `muted-foreground on input over ${backdrop} @ ${palette.name}`).toBeGreaterThanOrEqual(AA_NORMAL_DERIVATION_RATIO);
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

// ── #1110: THE QUIET SELECTION PAIR — bounded from BOTH sides, in every seed ────────────────────────
// `--color-selection-quiet` is the opaque ground a bulk-default selection control paints when it is ON
// (Backup & Restore's eleven-row all-selected "Include" fieldset — checkbox/variants.ts `tone: quiet`),
// and `--color-selection-quiet-foreground` is the check glyph on it. Two bounds, and only the PAIR of
// bounds is the design:
//   CEILING — it must stay QUIETER than the accent checked fill, or the arm has no reason to exist. That
//     is the whole owner ruling: spend the ember on a deliberate choice, not on the unremarkable default.
//   FLOOR   — the glyph must stay legible on its own fill (judged at the TEXT bar, though a checkmark
//     would only owe 1.4.11's 3:1), and the fill must stay discernible against every ground a control
//     can sit on — including the `bg-accent` an interactive row paints on hover, which is its worst.
// A one-sided pin would pass on a fill tuned all the way to the accent's loudness, or all the way down
// into the surface it sits on. Both directions are live here.
test.each(
  PALETTES.map((palette) => [palette.name, palette] as const),
)("#1110 %s: the quiet selection pair is legible AND quieter than the accent", (_name, palette) => {
  const fill = resolveTokenRgb("color.selection-quiet", palette);
  const mark = resolveTokenRgb("color.selection-quiet-foreground", palette);

  // FLOOR 1 — the mark on its own fill, at AA-NORMAL.
  expect(contrastRatio(mark, fill), `color.selection-quiet-foreground on color.selection-quiet @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);

  // FLOOR 2 — the fill against every ground a selection control rests on, at 1.4.11's 3:1. `accent` is
  // the interactive ground (hover/selected on ListRow + Card) and is the binding one.
  const grounds: ReadonlyArray<keyof typeof TOKENS> = [
    "color.background",
    "color.card",
    "color.popover",
    "color.surface-raised",
    "color.sidebar",
    "color.muted",
    "color.secondary",
    "color.accent",
  ];
  for (const ground of grounds) {
    expect(contrastRatio(fill, resolveTokenRgb(ground, palette)), `color.selection-quiet on ${ground} @ ${palette.name}`).toBeGreaterThanOrEqual(
      UI_COMPONENT_MIN_RATIO,
    );
  }

  // CEILING — quieter than the accent checked fill on the surface both are judged against.
  const card = resolveTokenRgb("color.card", palette);
  const accent = contrastRatio(resolveTokenRgb("color.primary", palette), card);
  expect(accent, `color.primary on color.card @ ${palette.name} must be a real painted fill, or the ceiling is vacuous`).toBeGreaterThan(
    UI_COMPONENT_MIN_RATIO,
  );
  expect(contrastRatio(fill, card), `color.selection-quiet must undercut color.primary on color.card @ ${palette.name}`).toBeLessThan(accent);
});

// ── D159 / #1641 / #1361-1: THE FORM-CONTROL BORDER — bounded from BOTH sides, in every seed ────────
// `--color-input-border` is the OPAQUE edge that identifies an input, select trigger, textarea, combobox,
// number-field group, checkbox, radio, switch track, colour swatch or file dropzone as something a user
// OPERATES. It exists because the shared `--color-border` is an 8%-alpha decorative hairline measuring
// 1.190-1.318:1 on every ground a control sits on, and WCAG 1.4.11's 3:1 governs the boundary of a
// user-interface component while saying nothing about a divider — so the fix was a second token, not a
// retune of a 72-consumer one (the ruling and its receipts are D159).
//
// THE FILL IS TRANSLUCENT, so the ground is COMPOSITED, never the panel alone (`alpha-token-needs-
// composited-contrast-probe`): `--color-input` is 0.12-0.16 alpha, so a control's real interior pixel is
// the fill over whatever panel is behind it, and the edge meets BOTH — the composited interior on one
// side and the bare panel on the other. Both are asserted, on the WORSE of the float and 8-bit-quantized
// ratio, because the pixel a reader sees is the rounded one.
//
// THE PANEL LIST IS THE ELEVATION SURFACE SET. `appearance.elevation` (flat|ramp|glow) and the glass and
// `prefers-contrast: more` arms reach PANEL chrome only — none of them writes a form-control edge — and
// what `ramp` changes is WHICH of these tokens a panel paints (it lifts fills to `--color-surface-raised`
// / `--color-card`). Sweeping the whole set is therefore the sweep over every appearance arm, which is
// why this pin needs no arm axis of its own.
//
// CEILING, and it is half the design: the resting edge must stay QUIETER on `--color-card` than the FOCUS
// RING, or the one state that must read as focused is outshouted by every control at rest. A one-sided
// pin would pass on an edge tuned to the loudness of body text.
const CONTROL_GROUNDS: ReadonlyArray<keyof typeof TOKENS> = [
  "color.background",
  "color.card",
  "color.popover",
  "color.surface-raised",
  "color.sidebar",
  "color.muted",
  "color.secondary",
  "color.accent",
];

test.each(
  PALETTES.map((palette) => [palette.name, palette] as const),
)("D159 %s: the form-control border clears 1.4.11 on every ground AND stays under the focus ring", (_name, palette) => {
  const edge = resolveTokenRgb("color.input-border", palette);
  const fill = resolveTokenOklch("color.input", palette);

  // FLOOR — 3:1 against each panel and against the field fill composited over that panel.
  for (const ground of CONTROL_GROUNDS) {
    const panel = resolveTokenRgb(ground, palette);
    expect(worstContrast(edge, panel), `color.input-border on ${ground} @ ${palette.name}`).toBeGreaterThanOrEqual(UI_COMPONENT_MIN_RATIO);
    expect(worstContrast(edge, compositeOver(fill, panel)), `color.input-border on the bg-input fill over ${ground} @ ${palette.name}`).toBeGreaterThanOrEqual(
      UI_COMPONENT_MIN_RATIO,
    );
  }

  // CEILING — quieter than the focus ring on the surface both are judged against.
  const card = resolveTokenRgb("color.card", palette);
  const ring = worstContrast(resolveTokenRgb("color.ring", palette), card);
  expect(ring, `color.ring on color.card @ ${palette.name} must be a real painted ring, or the ceiling is vacuous`).toBeGreaterThan(UI_COMPONENT_MIN_RATIO);
  expect(worstContrast(edge, card), `color.input-border must stay under color.ring on color.card @ ${palette.name}`).toBeLessThan(ring);
});

test.each(
  PALETTES.map((palette) => [palette.name, palette] as const),
)("D159 %s: --color-border is NOT the form-control edge — the split is why the token exists", (_name, palette) => {
  // The control arm of the OLD spelling, kept as the receipt that decided D159: raising the shared
  // divider to 3:1 was rejected, so it must still be measurably below the floor here. If a later change
  // ever brings `--color-border` to 3:1 on its own, this row is the one that says so out loud rather
  // than leaving two tokens quietly doing one job.
  const divider = resolveTokenOklch("color.border", palette);
  const card = resolveTokenRgb("color.card", palette);
  expect(
    worstContrast(compositeOver(divider, card), card),
    `color.border on color.card @ ${palette.name} — a decorative hairline, deliberately under 1.4.11 (D159)`,
  ).toBeLessThan(UI_COMPONENT_MIN_RATIO);
});

// ── #697: THE TRACK RAMP FILL — a non-text UI component (WCAG 1.4.11), floored at 3:1 on the LIGHT panel ──
// The 6-step categorical ramp (--color-track-N) fills pool/meter/clock gauges (TrackBar/SegmentBar/RingGauge/
// CoinFigure). The FILL is itself a graphical UI component conveying the reading, so 1.4.11's 3:1 applies even
// though a value TEXT sits beside it (that is the old ruling this fix superseded). At the mid-L single value the
// steps rendered 1.89–2.65:1 against the light panel; the fix made the token polarity-aware `light-dark()` and
// darkened the LIGHT arm to clear 3:1, leaving the DARK arm byte-identical. Measured the QUANTIZED way — the
// WORSE of the float and 8-bit-rounded ratio, because the pixel a reader sees is the rounded one (a float-only
// contrast lies; the house rule). The backings are the panels a fill sits on PLUS the `bg-input` rail the two
// bar species paint their fill inside (composited over the panel — a naive contrast on the alpha rail lies).
const TRACK_FILL_PATHS = ["color.track-1", "color.track-2", "color.track-3", "color.track-4", "color.track-5", "color.track-6"] as const;
const TRACK_PANELS = ["color.sidebar", "color.surface-raised", "color.card", "color.background"] as const;
const quantizeRgb = (c: Rgb): Rgb => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
/** The worse of the float and 8-bit-quantized contrast — the pixel a reader actually sees is the rounded one. */
const worstContrast = (a: Rgb, b: Rgb): number => Math.min(contrastRatio(a, b), contrastRatio(quantizeRgb(a), quantizeRgb(b)));

test.each(
  PALETTES.filter((p) => p.colorScheme === "light").map((p) => [p.name, p] as const),
)("#697 track-ramp gauge FILLS clear WCAG 1.4.11 3:1 on the %s panel (worse of float+8bit)", (_name, palette) => {
  const inputTok = parseOklch(palette.vars[TOKENS["color.input"].cssVar] ?? TOKENS["color.input"].value);
  for (const fillPath of TRACK_FILL_PATHS) {
    const fill = resolveTokenRgb(fillPath, palette);
    // Direct panel backings the ring gauge / coin disc ride.
    for (const panel of TRACK_PANELS) {
      expect(worstContrast(fill, resolveTokenRgb(panel, palette)), `${fillPath} fill on ${panel} @ ${palette.name}`).toBeGreaterThanOrEqual(
        UI_COMPONENT_MIN_RATIO,
      );
    }
    // The TrackBar / SegmentBar rail is `bg-input`: composite it over the panel and measure the fill in it.
    for (const panel of ["color.card", "color.sidebar"] as const) {
      const rail = compositeOver(inputTok, resolveTokenRgb(panel, palette));
      expect(worstContrast(fill, rail), `${fillPath} fill on the bg-input rail over ${panel} @ ${palette.name}`).toBeGreaterThanOrEqual(UI_COMPONENT_MIN_RATIO);
    }
  }
});

test("#697 the track-ramp DARK arm is unchanged — still ≥3:1 on the dark panel (the mechanism survived)", () => {
  const hearth = PALETTES.find((p) => p.name === "hearth");
  if (hearth === undefined) {
    throw new Error("hearth (base dark) palette missing");
  }
  for (const fillPath of TRACK_FILL_PATHS) {
    const fill = resolveTokenRgb(fillPath, hearth);
    for (const panel of ["color.sidebar", "color.surface-raised", "color.card"] as const) {
      expect(worstContrast(fill, resolveTokenRgb(panel, hearth)), `${fillPath} dark fill on ${panel}`).toBeGreaterThanOrEqual(UI_COMPONENT_MIN_RATIO);
    }
  }
});

// ── #939: THE CHART RAMP — categorical Canvas/DOM fills on every chart host ────────────────────────
const CHART_FILL_PATHS = ["color.chart-1", "color.chart-2", "color.chart-3", "color.chart-4", "color.chart-5"] as const;
const CHART_PANELS = ["color.background", "color.card", "color.surface-raised", "color.sidebar"] as const;
const CHART_DARK_ARMS = ["oklch(0.72 0.175 52)", "oklch(0.7 0.1 200)", "oklch(0.68 0.12 300)", "oklch(0.74 0.11 130)", "oklch(0.7 0.12 35)"] as const;

test.each(PALETTES.map((palette) => [palette.name, palette] as const))("#939 chart fills clear WCAG 1.4.11 3:1 on every %s chart host", (_name, palette) => {
  for (const fillPath of CHART_FILL_PATHS) {
    const fill = resolveTokenRgb(fillPath, palette);
    for (const panel of CHART_PANELS) {
      expect(worstContrast(fill, resolveTokenRgb(panel, palette)), `${fillPath} on ${panel} @ ${palette.name}`).toBeGreaterThanOrEqual(UI_COMPONENT_MIN_RATIO);
    }
  }
});

const CHART_BASE_LIGHTNESSES = [...Array.from({ length: 101 }, (_unused, index) => index / 100), 0.6199, 0.62, 0.6201];
const CHART_BASE_CHROMAS = [0, 0.01, 0.1, 0.25, 0.4] as const;
const CHART_BASE_HUES = [0, 60, 120, 180, 240, 300] as const;
const CUSTOM_CHART_VARS = ["--color-chart-1", "--color-chart-2", "--color-chart-3", "--color-chart-4", "--color-chart-5"] as const;

function chartPairDistances(colors: readonly Oklch[]): readonly [oklab: number, pixel: number] {
  let oklab = Number.POSITIVE_INFINITY;
  let pixel = Number.POSITIVE_INFINITY;
  for (let left = 0; left < colors.length; left += 1) {
    for (let right = left + 1; right < colors.length; right += 1) {
      const a = colors[left];
      const b = colors[right];
      if (a === undefined || b === undefined) {
        throw new Error("custom chart-ramp pair escaped the five-color matrix");
      }
      const ah = (a.h * Math.PI) / 180;
      const bh = (b.h * Math.PI) / 180;
      oklab = Math.min(oklab, Math.hypot(a.l - b.l, a.c * Math.cos(ah) - b.c * Math.cos(bh), a.c * Math.sin(ah) - b.c * Math.sin(bh)));
      const ap = quantizeRgb(oklchToRgb(a));
      const bp = quantizeRgb(oklchToRgb(b));
      pixel = Math.min(pixel, Math.hypot(ap.r - bp.r, ap.g - bp.g, ap.b - bp.b));
    }
  }
  return [oklab, pixel];
}

function requiredCompositedBase(background: string, ambient: string): Oklch {
  const base = compositedBase(background, ambient);
  if (base === null) {
    throw new Error(`accepted base did not resolve @ ${background}`);
  }
  return base;
}

/** The full OKLCH base sweep: measured 6.8s on a loaded box (2026-09-01 barrier), over vitest's 5s default. */
const CHART_RAMP_BUDGET_MS = 30_000;

test(
  "#939 every accepted OKLCH base emits a contrast-safe, distinguishable custom chart ramp",
  () => {
    const ambient = TOKENS["color.background"].value;
    for (const l of CHART_BASE_LIGHTNESSES) {
      for (const c of CHART_BASE_CHROMAS) {
        for (const h of CHART_BASE_HUES) {
          const baseStr = `oklch(${l} ${c} ${h})`;
          const base = requiredCompositedBase(baseStr, ambient);
          const ramp = rampOf(base);
          const panels = [base, rampSurface(base, ramp.card), rampSurface(base, ramp.surfaceRaised), rampSurface(base, ramp.sidebar)];
          const { vars } = clampThemeTokens({ background: baseStr });
          const colors = CUSTOM_CHART_VARS.map((cssVar): Oklch => {
            const emitted = vars[cssVar];
            if (emitted === undefined) {
              throw new Error(`${cssVar} was not emitted @ ${baseStr}`);
            }
            return parseOklch(emitted);
          });
          for (const [index, fill] of colors.entries()) {
            for (const panel of panels) {
              expect(worstContrast(oklchToRgb(fill), oklchToRgb(panel)), `${CUSTOM_CHART_VARS[index]} on custom host @ ${baseStr}`).toBeGreaterThanOrEqual(
                UI_COMPONENT_MIN_RATIO,
              );
            }
          }
          const [oklab, pixel] = chartPairDistances(colors);
          expect(oklab, `custom ramp minimum OKLab distance @ ${baseStr}`).toBeGreaterThanOrEqual(0.07);
          expect(pixel, `custom ramp minimum quantized RGB distance @ ${baseStr}`).toBeGreaterThanOrEqual(30);
        }
      }
    }
  },
  CHART_RAMP_BUDGET_MS,
);

const ACCEPTED_CHART_BASES = [
  ["named", "red"],
  ["named containing url letters", "burlywood"],
  ["transparent named", "transparent"],
  ["short hex alpha", "#f008"],
  ["long hex opaque", "#102030ff"],
  ["rgb comma", "rgb(20, 40, 60)"],
  ["rgb space partial alpha", "rgb(95% 90% 80% / 35%)"],
  ["hsl comma", "hsl(210, 50%, 40%)"],
  ["hsl space transparent", "hsl(30 40% 20% / 0)"],
  ["oklab", "oklab(0.7 -0.1 0.08 / 1)"],
  ["pivot dark side", "oklch(0.62 0.01 60)"],
  ["pivot light side", "oklch(0.6201 0.01 60)"],
  ["extreme accepted gamut", "oklch(0.2 3.6 225)"],
  ["invalid safe bare word", "notacolorxx"],
] as const;

const CHART_AMBIENTS = [
  ["hearth", TOKENS["color.background"].value],
  ["light", SEED_THEME_VALUE_SETS.light.vars["--color-background"]],
  ["mocha", SEED_THEME_VALUE_SETS.mocha.vars["--color-background"]],
] as const;

test("#939 every accepted spelling/alpha/gamut class is total and clears every actual composited chart host", () => {
  for (const [spelling, background] of ACCEPTED_CHART_BASES) {
    for (const [ambientName, ambient] of CHART_AMBIENTS) {
      expect(() => clampThemeTokens({ background }, ambient), `${spelling} over ${ambientName} must not throw`).not.toThrow();
      const base = requiredCompositedBase(background, ambient);
      const deltas = rampOf(base);
      const panels = [base, rampSurface(base, deltas.card), rampSurface(base, deltas.surfaceRaised), rampSurface(base, deltas.sidebar)];
      const { vars } = clampThemeTokens({ background }, ambient);
      const colors = CUSTOM_CHART_VARS.map((cssVar): Oklch => {
        const emitted = vars[cssVar];
        if (emitted === undefined) {
          throw new Error(`${cssVar} was not emitted for ${spelling} over ${ambientName}`);
        }
        return parseOklch(emitted);
      });
      for (const [index, fill] of colors.entries()) {
        for (const panel of panels) {
          expect(worstContrast(oklchToRgb(fill), oklchToRgb(panel)), `${CUSTOM_CHART_VARS[index]} on ${spelling}/${ambientName}`).toBeGreaterThanOrEqual(
            UI_COMPONENT_MIN_RATIO,
          );
        }
      }
      const [, pixel] = chartPairDistances(colors);
      expect(pixel, `${spelling}/${ambientName} quantized distinction`).toBeGreaterThanOrEqual(30);
    }
  }
});

test("#939 chart-ramp contrast matrix has a planted failing color (non-vacuity control)", () => {
  const light = PALETTES.find((palette) => palette.name === "light");
  if (light === undefined) {
    throw new Error("Light seed missing from generated value sets");
  }
  const plantedBadChartColor = resolveTokenRgb("color.card", light);
  const failures = CHART_PANELS.filter((panel) => worstContrast(plantedBadChartColor, resolveTokenRgb(panel, light)) < UI_COMPONENT_MIN_RATIO);
  expect(failures, "a chart color planted at the card tone must be caught").toContain("color.card");
});

test.each(
  CHART_FILL_PATHS.map((path, index) => [path, CHART_DARK_ARMS[index]] as const),
)("#939 %s keeps its sacred dark arm byte-identical", (path, darkArm) => {
  expect(resolveArm(TOKENS[path].value, "dark")).toBe(darkArm);
});

test.each(["light", "dark"] as const)("#939 chart colors stay mutually distinguishable in the %s arm", (scheme) => {
  const colors = CHART_FILL_PATHS.map((path) => parseOklch(resolveArm(TOKENS[path].value, scheme)));
  let minimumOklabDistance = Number.POSITIVE_INFINITY;
  let minimumPixelDistance = Number.POSITIVE_INFINITY;
  for (let left = 0; left < colors.length; left++) {
    for (let right = left + 1; right < colors.length; right++) {
      const a = colors[left];
      const b = colors[right];
      if (a === undefined || b === undefined) {
        throw new Error("chart-ramp pair escaped the five-color matrix");
      }
      const ah = (a.h * Math.PI) / 180;
      const bh = (b.h * Math.PI) / 180;
      minimumOklabDistance = Math.min(
        minimumOklabDistance,
        Math.hypot(a.l - b.l, a.c * Math.cos(ah) - b.c * Math.cos(bh), a.c * Math.sin(ah) - b.c * Math.sin(bh)),
      );
      const ap = quantizeRgb(oklchToRgb(a));
      const bp = quantizeRgb(oklchToRgb(b));
      minimumPixelDistance = Math.min(minimumPixelDistance, Math.hypot(ap.r - bp.r, ap.g - bp.g, ap.b - bp.b));
    }
  }
  expect(minimumOklabDistance, `${scheme} arm minimum OKLab distance`).toBeGreaterThanOrEqual(0.07);
  expect(minimumPixelDistance, `${scheme} arm minimum quantized RGB distance`).toBeGreaterThanOrEqual(67);
});

const RELATIVE_FOREGROUND_RE = /^oklch\(from .+? ([\d.]+) 0 h \/ 1\)$/u;
function emittedForegroundRgb(vars: Readonly<Record<string, string>>, cssVar: string, base: Oklch): Rgb {
  const emitted = vars[cssVar];
  const match = RELATIVE_FOREGROUND_RE.exec(emitted ?? "");
  if (match === null) {
    throw new Error(`not an emitted neutral foreground: ${cssVar} = ${String(emitted)}`);
  }
  return oklchToRgb({ l: Number(match[1]), c: 0, h: base.h });
}

test("clamp DERIVED neutral chrome clears AA on every realistic light + dark base", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const ramp = rampOf(base);
    const surfaces = {
      background: base,
      raised: rampSurface(base, ramp.surfaceRaised),
      card: rampSurface(base, ramp.card),
      popover: rampSurface(base, ramp.popover),
      sidebar: rampSurface(base, ramp.sidebar),
      secondary: rampSurface(base, ramp.secondary),
      "sidebar-accent": rampSurface(base, ramp.sidebarAccent),
    };
    const { vars } = clampThemeTokens({ background: baseStr });
    const foreground = emittedForegroundRgb(vars, "--color-foreground", base);
    for (const [name, surface] of Object.entries({ background: surfaces.background, raised: surfaces.raised, card: surfaces.card })) {
      expect(contrastRatio(foreground, oklchToRgb(surface)), `derived foreground on ${name} @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
    for (const [cssVar, name, surface] of [
      ["--color-card-foreground", "card", surfaces.card],
      ["--color-popover-foreground", "popover", surfaces.popover],
      ["--color-sidebar-foreground", "sidebar", surfaces.sidebar],
      ["--color-secondary-foreground", "secondary", surfaces.secondary],
      ["--color-sidebar-accent-foreground", "sidebar-accent", surfaces["sidebar-accent"]],
    ] as const) {
      expect(contrastRatio(emittedForegroundRgb(vars, cssVar, base), oklchToRgb(surface)), `${cssVar} on ${name} @ ${baseStr}`).toBeGreaterThanOrEqual(
        NORMAL_MIN_RATIO,
      );
    }
    // Muted foreground over the derived input fill (contrast tone at inputAlpha) composited over the
    // lightest (popover) and base surfaces — the worst realistic backdrops — PLUS the opaque derived
    // `muted` surface it labels directly (badges/skeleton text). All clear the normal-text floor.
    const inputFill: Oklch = { l: derivedForegroundLightness(base), c: 0, h: base.h, alpha: D.inputAlpha };
    const muted = emittedForegroundRgb(vars, "--color-muted-foreground", base);
    for (const [name, surface] of [
      ["popover", surfaces.popover],
      ["background", base],
    ] as const) {
      const ratio = contrastRatio(muted, compositeOver(inputFill, oklchToRgb(surface)));
      expect(ratio, `derived muted-foreground on input over ${name} @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
    const mutedSurface = rampSurface(base, ramp.muted);
    expect(contrastRatio(muted, oklchToRgb(mutedSurface)), `derived muted-foreground on muted @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    // …and on the CARD ramp surface, which the seed table already floors (`bodyPairs`) but the derived
    // sweep did not: #674 gave the S1 control band the composer's opaque `bg-card`, and the ink an
    // `intent="outline"` chip paints on it is exactly this token. Without this row the band's contrast
    // guarantee held on the three seeds and was merely BRACKETED (card sits between `background` and
    // `muted` in L) on a user's own palette.
    expect(contrastRatio(muted, oklchToRgb(surfaces.card)), `derived muted-foreground on card @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

test("clamp DERIVED accent (hover/selected) surface + its foreground clear AA on every realistic base", () => {
  // The P2 pairing: a selected list-row's title (accent-foreground) on the derived accent surface must
  // stay legible under any theme — the light-theme quick-pick case that was illegible when accent stayed
  // the static dark tone under a light base.
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const accentDl = rampOf(base).accent;
    const accent = rampSurface(base, accentDl);
    const accentFg = emittedForegroundRgb(clampThemeTokens({ background: baseStr }).vars, "--color-accent-foreground", base);
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
//      the plate composited over WORST-CASE art (pure black AND pure white — RAW art, kept as this
//      property's input even though #487 floored `BACKGROUND_DIM_MIN` at 0.45; see the kit contract's note
//      on why a shipped alpha is never relaxed by a new floor), for every shipped palette and every realistic custom base
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
//   2. the band's paired reading-plate ink clears AA on it — the band is opaque, so unlike the plate
//      there is no art in this composite and no alpha to solve.
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

test("#241 the band's paired reading-plate ink clears AA on the band, every realistic base", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const ink = oklchToRgb(readingPlateForeground(base));
    const ratio = contrastRatio(ink, oklchToRgb(readingBandSurface(base)));
    expect(ratio, `reading-plate foreground on the band @ ${baseStr}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});

test("#204 the plate alpha FLOORS AA for the paired reading ink over worst-case art on every realistic base", () => {
  for (const baseStr of REALISTIC_BASES) {
    const base = parseOklch(baseStr);
    const fg = oklchToRgb(readingPlateForeground(base));
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
// chats re-score, 2026-08-18): the light-palette room read narration
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
//
// #487: THE RULING SURVIVES — ITS INPUT CHANGED. Those numbers are the composite over RAW art, and raw art
// stopped being legal when `BACKGROUND_DIM_MIN` was floored at 0.45 (`@orb/contracts/settings/appearance`).
// The plate does not move a digit; the SCRIM under it does the closing, and the property is asserted one
// test below (`#487`) over the same worst-case arts with the floor composited in. `speaker` stays out of the
// guaranteed set at both layers: closing IT needs dim 0.714, the same sacred-room move D144(d) refuses.
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

// ── #487: THE WALLPAPER SCRIM'S DERIVED FLOOR — the layer that closes the #217 dark-arm hole ─────────
// `theme-background-layer.tsx` calls its scrim "mandatory … non-negotiable for text legibility" while
// `BACKGROUND_DIM_MIN` was 0, so a legal setting rendered the guard at `opacity: 0` and made the
// transcript's contrast a property of the user's picture. The floor is what makes that sentence true, and
// this is where the number comes from — nothing here is hand-picked.
//
// THE COMPOSITE, bottom to top: art → `--color-backdrop` at `tokenAlpha × dim` (the element's `opacity`
// multiplies the token's own alpha) → `--color-reading-plate` at its palette alpha → the ink. The PLATE IS
// UNTOUCHED (D144(d) / #217: dark plates keep 0.65); only the layer beneath it gained a bound.
//
// WHY 0.45, and why `speaker` is not in the set. Solved over WHITE art (the dark plates' worst legal case):
// mocha narration needs 0.442, hearth narration 0.384, mocha dialogue 0.107, prose-body/foreground already
// clear at 0. `speaker` needs 0.714 — a dim that all but deletes the art, i.e. the same sacred-room move
// D144(d) refuses, so it stays the recorded residual rather than a silent inclusion. The binding 0.442 is
// stated as 0.45 because that is already `BACKGROUND_DIM_DEFAULT`: floor and default coincide, so a stored
// value below the floor `.catch`es straight onto it and no lift migration exists to get wrong.
const SCRIM_PATH = "color.backdrop" as const;
/** The three body inks the floor GUARANTEES over worst-case art, plus the neutral the chrome plates pair. */
const FLOORED_INK_PATHS = ["color.dialogue", "color.narration", "color.prose-body", "color.foreground"] as const;
/** A token's raw oklch IN a palette (value-set override else base, correct light-dark arm) — `resolveTokenRgb`
 *  drops the alpha slot, and both scrim and plate are composited BY their alpha here. */
function resolveTokenOklch(path: keyof typeof TOKENS, palette: Palette): Oklch {
  return parseOklch(resolveArm(palette.vars[TOKENS[path].cssVar] ?? TOKENS[path].value, palette.colorScheme));
}
/** The surface a transcript ink actually lands on at a given wallpaper dim. */
function readingBackdropOverArt(palette: Palette, art: Rgb, dim: number): Rgb {
  const scrim = resolveTokenOklch(SCRIM_PATH, palette);
  const plate = resolveTokenOklch(READING_PLATE_PATH, palette);
  return compositeOver(plate, compositeOver({ ...scrim, alpha: scrim.alpha * dim }, art));
}

test.each(
  PALETTES.map((p) => [p.name, p] as const),
)("#487 %s: at BACKGROUND_DIM_MIN the body inks clear AA over the plate over the SCRIMMED worst-case art", (_name, palette) => {
  for (const [artName, art] of WORST_ART) {
    const composited = readingBackdropOverArt(palette, art, BACKGROUND_DIM_MIN);
    for (const ink of FLOORED_INK_PATHS) {
      const ratio = contrastRatio(resolveTokenRgb(ink, palette), composited);
      expect(ratio, `${ink} over plate over scrim(${BACKGROUND_DIM_MIN}) over ${artName} @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
    }
  }
});

test("#487 the floor is a FLOOR: at dim 0 the same property FAILS on a dark palette (the non-vacuity control)", () => {
  // Without this the test above passes for a floor of 0 as happily as for 0.45 and proves nothing. The dark
  // palettes over WHITE art are the arm the floor exists for — measured at dim 0: hearth narration 3.29,
  // mocha narration 3.12. Lowering `BACKGROUND_DIM_MIN` therefore reds the property test, and deleting the
  // scrim's effect reds this one.
  const dark = PALETTES.filter((p) => p.colorScheme === "dark");
  expect(dark.length, "there is at least one dark palette to control against").toBeGreaterThan(0);
  for (const palette of dark) {
    const unscrimmed = readingBackdropOverArt(palette, { r: 255, g: 255, b: 255 }, 0);
    const ratios = FLOORED_INK_PATHS.map((ink) => contrastRatio(resolveTokenRgb(ink, palette), unscrimmed));
    expect(Math.min(...ratios), `some body ink fails AA over RAW white art @ ${palette.name}`).toBeLessThan(NORMAL_MIN_RATIO);
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
    expect(brighter, `hairline ring lighter than the base @ ${baseStr}`).toBe(surfacePolarity(base) === "dark");
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

// ── #682: THE DERIVED SURFACE FAMILY — a light base derives DOWN instead of clamping at white ────────
// The ramp shipped as ONE additive block (`calc(l + delta)`, every member but `sidebar` positive). On a
// near-white base every positive member saturates at L = 1.0 and the family collapses into ONE colour:
// measured on HEAD at base oklch(0.98 0.004 75), card = muted = surface-raised = popover = secondary =
// accent = sidebar-accent = L 1.000, i.e. muted-on-card rendered at 1.0000:1 — the meter arc's track
// (`text-muted` over `bg-card`), a card skeleton, a track bar: invisible, not subtle.
//
// The pins are stated on the EMITTED custom properties (what `ThemeScope` actually puts in the DOM),
// resolved to L the way the browser resolves `oklch(from <base> calc(l + d) c h)`, so they measure the
// derivation through its product surface rather than through the arm-selection function.
//
// THE FLOOR IS MEASURED, NOT DECLARED, and it is NOT 3:1. Two NEIGHBOURING neutral ramp surfaces cannot
// reach the WCAG 1.4.11 non-text ratio on either polarity — the shipped Hearth pair (card 0.205 / muted
// 0.255) measures 1.1356:1 and the shipped Light seed pair (0.995 / 0.95) 1.1412:1. So the family floor
// asserted here is the DARK arm's own separation at the shipped dark base: the light arm must be at
// least as legible as the polarity that was never broken. (A track that needs more than a neighbouring
// ramp step is a METER-side question — which token the track picks — not a derivation one.)
const RAMP_EMIT_RE = /^oklch\(from .+? calc\(l \+ (-?[\d.]+)\) c h\)$/u;
/** The L the browser resolves an emitted ramp var to for `base` — the delta read back off the CSS. */
function emittedRampL(vars: Readonly<Record<string, string>>, cssVar: string, base: Oklch): number {
  const emitted = vars[cssVar];
  const m = RAMP_EMIT_RE.exec(emitted ?? "");
  if (m === null) {
    throw new Error(`not an emitted ramp surface: ${cssVar} = ${String(emitted)}`);
  }
  return clamp01(base.l + Number(m[1]));
}
/** The five ramp members whose L must stay pairwise distinct — the LOW-emphasis family a graphic paints
 *  on a card. `popover` is excluded on purpose: it is the same tone as `card` on the shipped Light seed
 *  (both 0.995), a deliberate tie, not a collapse. */
const RAMP_FAMILY_VARS = ["--color-card", "--color-muted", "--color-secondary", "--color-accent", "--color-sidebar-accent"] as const;
const NEAR_WHITE_BASES = [...LIGHT_BASES, "oklch(1 0 0)"];

test("#682 the derived surface family stays PAIRWISE DISTINCT on every near-white base (no clamp collapse)", () => {
  for (const baseStr of NEAR_WHITE_BASES) {
    const base = parseOklch(baseStr);
    const { vars } = clampThemeTokens({ background: baseStr });
    const levels = RAMP_FAMILY_VARS.map((cssVar) => emittedRampL(vars, cssVar, base));
    expect(new Set(levels).size, `distinct ramp tones @ ${baseStr} (got ${levels.join(", ")})`).toBe(RAMP_FAMILY_VARS.length);
  }
});

/** The card|muted separation this derivation produces for `baseStr` — the pair the meter arc's track,
 *  a card skeleton and a track bar are made of. */
function derivedCardMutedRatio(baseStr: string): number {
  const base = parseOklch(baseStr);
  const { vars } = clampThemeTokens({ background: baseStr });
  return contrastRatio(
    oklchToRgb({ ...base, l: emittedRampL(vars, "--color-card", base) }),
    oklchToRgb({ ...base, l: emittedRampL(vars, "--color-muted", base) }),
  );
}

test("#682 muted-on-card is never less legible on a light base than on the palettes orb SHIPS", () => {
  // The floor is RECOMPUTED, never declared: the separation this same derivation produces at the shipped
  // Light seed's base. A user's own near-white palette must be at least as legible as the light palette
  // we ship. NON-VACUITY, both directions: the reference is a real step (>1.1) and it agrees with the
  // DARK arm's own separation to within 2% (dark 1.1356 at Hearth vs light 1.1327 at the Light seed base,
  // measured with uniform chroma) — so neither polarity is the weak one and the reference cannot rot to
  // nothing without reddening here first.
  const lightSeedFloor = derivedCardMutedRatio("oklch(0.98 0.004 75)");
  const darkSeedRatio = derivedCardMutedRatio("oklch(0.158 0.006 60)");
  expect(lightSeedFloor, "the light reference is a real step, not a rounding artefact").toBeGreaterThan(1.1);
  expect(Math.abs(lightSeedFloor - darkSeedRatio) / darkSeedRatio, "the two arms separate the pair by the same order").toBeLessThan(0.02);
  for (const baseStr of LIGHT_BASES) {
    expect(derivedCardMutedRatio(baseStr), `muted on card @ ${baseStr}`).toBeGreaterThanOrEqual(lightSeedFloor);
  }
});

test.each(PALETTES.map((p) => [p.name, p] as const))("#204 %s: the four prose inks clear AA on their own base (the §7a no-op criterion)", (_name, palette) => {
  const baseRgb = resolveTokenRgb("color.background", palette);
  for (const ink of PROSE_INK_PATHS) {
    const ratio = contrastRatio(resolveTokenRgb(ink, palette), baseRgb);
    expect(ratio, `${ink} on background @ ${palette.name}`).toBeGreaterThanOrEqual(NORMAL_MIN_RATIO);
  }
});
