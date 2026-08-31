// The derived-theme FRESHNESS gate (UI-Architecture §3, D42: "the Tailwind theme is DERIVED, never
// hand-authored — drift is impossible by construction"). This test IS the construction: it re-runs
// the codegen from src/tokens/tokens.json and byte-compares against the committed artifacts, so a
// hand-edited theme.css/index.ts OR a tokens.json edit without `pnpm --filter @orb/ui tokens:build`
// fails `pnpm test`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_THEME_VALUE_SETS, TOKEN_POLARITY_ARMS, TOKENS } from "@orb/ui/tokens";
import { AVATAR_HUE_STEPS } from "../../../packages/ui/src/primitives/avatar/hue.ts";
import { generateArtifacts, renderGeneratedCss } from "../../../packages/ui/tokens.build.ts";
import { expect, test } from "../../support/fixtures.ts";

const UI_ROOT = join(import.meta.dirname, "../../../packages/ui");

/** The emitted pointer-fine override block — its `:root { … }` body is capture group 1. */
const FINE_BLOCK_RE = /@media \(pointer: fine\) \{\s*:root \{([\s\S]*?)\}\s*\}/u;

test("theme.css, tokens/index.ts and tokens/themes.gen.ts are exactly what tokens.json + themes/*.json derive (no drift, no hand edits)", async () => {
  const { themeCss, tokensTs, themesTs } = await generateArtifacts();
  expect(readFileSync(join(UI_ROOT, "src/styles/theme.css"), "utf8")).toBe(themeCss);
  expect(readFileSync(join(UI_ROOT, "src/tokens/index.ts"), "utf8")).toBe(tokensTs);
  // The seed value-sets are their OWN generated module (they outgrew the index's size cap) — freshness
  // covers it too, or a hand-edited palette would drift silently.
  expect(readFileSync(join(UI_ROOT, "src/tokens/themes.gen.ts"), "utf8")).toBe(themesTs);
});

test("runtime CSS placement emits Tailwind namespaces into @theme and private aliases into :root", () => {
  const css = renderGeneratedCss([
    { path: ["spacing", "control"], value: "2rem", placement: "theme" },
    { path: ["orb", "density-control"], value: "var(--spacing-control)", placement: "root" },
  ]);
  const themeEnd = css.indexOf("}\n");
  const themeBlock = css.slice(0, themeEnd);
  const rootBlock = css.slice(themeEnd);

  expect(themeBlock).toContain("--spacing-control: 2rem;");
  expect(themeBlock).not.toContain("--orb-density-control");
  expect(rootBlock).toContain(":root {");
  expect(rootBlock).toContain("--orb-density-control: var(--spacing-control);");
  expect(rootBlock).not.toContain("--spacing-control: 2rem;");
});

test("the touch floor holds PER-POINTER: coarse @theme meets ≥44px, fine override is 32/34/40 (D62 P1, gate touch-target-floor; control-sm raised to the 32px tap-target floor Task #76)", async () => {
  const { themeCss, tokensTs } = await generateArtifacts();

  // COARSE — the @theme values (the TS map's static `value` = the coarse literal): the ≥44px floor.
  const coarseRem = (name: string): number => {
    const match = tokensTs.match(new RegExp(`"spacing\\.${name}".*value: "([\\d.]+)rem"`, "u"));
    expect(match, `spacing.${name} must exist as a rem dimension`).not.toBeNull();
    return Number(match?.[1]);
  };
  const coarseFloor = coarseRem("touch-target");
  expect(coarseFloor).toBeGreaterThanOrEqual(2.75); // 44px @ 16px root
  for (const control of ["control-sm", "control-md", "control-lg"]) {
    expect(coarseRem(control), `coarse spacing.${control} may not undercut the ≥44px touch floor`).toBeGreaterThanOrEqual(coarseFloor);
  }

  // FINE — the emitted @media(pointer:fine) :root override: the desktop density scale.
  const fineBlock = themeCss.match(FINE_BLOCK_RE);
  expect(fineBlock, "an @media(pointer:fine) :root override block must be emitted for the desktop density scale").not.toBeNull();
  const fineBody = fineBlock?.[1] ?? "";
  const fineRem = (name: string): number => {
    const m = fineBody.match(new RegExp(`--spacing-${name}:\\s*([\\d.]+)rem`, "u"));
    expect(m, `--spacing-${name} must be present in the fine override block`).not.toBeNull();
    return Number(m?.[1]);
  };
  expect(fineRem("touch-target"), "fine touch-target = 28px").toBe(1.75);
  expect(fineRem("control-sm"), "fine control-sm = 32px (Task #76 tap-target floor)").toBe(2);
  expect(fineRem("control-md"), "fine control-md = 34px").toBe(2.125);
  expect(fineRem("control-lg"), "fine control-lg = 40px").toBe(2.5);
  const fineFloor = fineRem("touch-target");
  for (const control of ["control-sm", "control-md", "control-lg"]) {
    expect(fineRem(control), `fine spacing.${control} may not undercut the fine touch floor`).toBeGreaterThanOrEqual(fineFloor);
  }
});

test("the load-bearing token names exist (backdrop · reading plate · chart ramp · the D44 §12.1 override targets)", async () => {
  const { themeCss } = await generateArtifacts();
  const required = [
    "--color-backdrop",
    "--color-reading-plate",
    "--color-chart-1",
    "--color-chart-5",
    "--color-user-bubble",
    "--color-ai-bubble",
    "--color-dialogue",
    "--color-narration",
    "--color-prose-body",
    "--color-speaker",
    "--container-cq-sm",
    "--spacing-touch-target",
    "--color-info",
    "--shadow-glow",
    "--shadow-overlay",
    "--text-micro",
    "--tracking-micro",
    "--spacing-avatar-sm",
    "--spacing-avatar-md",
    "--spacing-avatar-lg",
    "--width-dialog-sm",
    "--width-dialog-md",
    "--width-dialog-lg",
    "--motion-shimmer",
  ];
  for (const name of required) {
    expect(themeCss, `${name} must be emitted into @theme`).toContain(`${name}:`);
  }
});

// The colour math shared by the token-VALUE invariants below (browser-independent — it reads only TOKENS
// and the generated seed value-sets, so it lives with the other token invariants):
// oklch → linear sRGB (Björn Ottosson's OKLab matrix) → relative luminance → the WCAG contrast ratio.
// Its main consumer is the avatar fallback-hue AA matrix at the foot of this file.
const AA_SMALL_TEXT = 4.5;
const OKLCH_RE = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/u;

function parseOklch(value: string): readonly [number, number, number] {
  const m = OKLCH_RE.exec(value);
  if (m === null) {
    throw new Error(`token is not an oklch literal: ${value}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// The polarity-aware intent tokens (W2): each is ONE static `light-dark(<light-arm>, <dark-arm>)`
// value — light arm FIRST per CSS syntax — selected by the inherited color-scheme. Per-palette AA is
// enforced in palette-contrast.suite.test.ts; here we just prove the shape + that each arm is a real
// oklch parseOklch can still consume.
const LIGHT_DARK_RE = /^light-dark\(\s*(.+?)\s*,\s*(.+)\s*\)$/u;

/** The matching arm of a CSS `light-dark(<light>, <dark>)` value (light-arm FIRST), or the value itself when it isn't a light-dark() form. parseOklch stays strict — callers resolve the arm before parsing. */
function resolveArm(value: string, scheme: "light" | "dark"): string {
  const m = LIGHT_DARK_RE.exec(value);
  if (m === null) {
    return value;
  }
  return scheme === "light" ? (m[1] ?? value) : (m[2] ?? value);
}

const LIGHT_DARK_TOKENS = [
  "color.destructive",
  "color.destructive-foreground",
  "color.success",
  "color.success-foreground",
  "color.warning",
  "color.warning-foreground",
  "color.info",
  "color.chart-1",
  "color.chart-2",
  "color.chart-3",
  "color.chart-4",
  "color.chart-5",
] as const;

// highlight + its foreground are POLARITY-INDEPENDENT (a text-mark BACKGROUND, never text) — the former
// light-dark(X,X) no-op was collapsed to a single plain oklch (derive-modernization-audit §W6). They are
// deliberately NOT light-dark() like the 4 divergent intents above.
const INTENT_PLAIN_TOKENS = ["color.highlight", "color.highlight-foreground"] as const;

test.each(LIGHT_DARK_TOKENS)("%s is a light-dark() token whose BOTH arms are real oklch literals (dark arm = the byte-identical original)", (path) => {
  const value = TOKENS[path].value;
  expect(value, `${path} must be a light-dark() value`).toMatch(LIGHT_DARK_RE);
  // Both arms must survive strict parseOklch (the value itself would throw — resolveArm unwraps first).
  expect(() => parseOklch(resolveArm(value, "light"))).not.toThrow();
  expect(() => parseOklch(resolveArm(value, "dark"))).not.toThrow();
  expect(TOKEN_POLARITY_ARMS[path]).toEqual({ light: resolveArm(value, "light"), dark: resolveArm(value, "dark") });
  // resolveArm on a plain oklch (a surface token) is a pass-through.
  expect(resolveArm(TOKENS["color.card"].value, "light")).toBe(TOKENS["color.card"].value);
});

test.each(INTENT_PLAIN_TOKENS)("%s is a single plain oklch (polarity-independent — NOT a no-op light-dark(X,X))", (path) => {
  const value = TOKENS[path].value;
  expect(value, `${path} must NOT be a light-dark() value`).not.toMatch(LIGHT_DARK_RE);
  expect(() => parseOklch(value)).not.toThrow();
});

function relLuminance([L, C, hDeg]: readonly [number, number, number]): number {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (L - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (L - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  const lin = [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ].map((v) => Math.max(0, Math.min(1, v)));
  const [lr = 0, lg = 0, lb = 0] = lin;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast between two OKLCH triples. Takes PARSED triples, not strings: the avatar guard below
 *  measures DERIVED fills that never exist as a literal anywhere (see `derivedAvatarFill`). */
function contrast(fg: readonly [number, number, number], bg: readonly [number, number, number]): number {
  const lf = relLuminance(fg);
  const lb = relLuminance(bg);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

// THE AVATAR FALLBACK-HUE AA GUARD, RETARGETED (#103, 2026-08-16). It used to sweep `color.chart-1..5`,
// which is the wrong subject twice over now: the monogram no longer paints from the chart ramp (it derives
// from the ACTIVE THEME's `--color-primary` per `avatarFallbackHueColor`), and a base-only ramp could not
// have answered the question a MULTI-PALETTE app actually asks. The guard is now the full matrix — every
// palette × every hue step — asserted against THAT palette's own `primary-foreground`, which is the pairing
// the component ships. The chart ramp keeps its own classification test; it is charts' concern again.
//
// `AVATAR_HUE_STEPS` is imported from the component's ONE home, so a retuned step is measured here rather
// than re-spelled: this test cannot go stale against the derivation it guards.
const AVATAR_PALETTES: ReadonlyArray<{ readonly name: string; readonly primary: string; readonly foreground: string }> = [
  // Hearth IS the base @theme block (no value-set file) — the seeds re-value the same two paths.
  { name: "hearth", primary: TOKENS["color.primary"].value, foreground: TOKENS["color.primary-foreground"].value },
  ...Object.entries(SEED_THEME_VALUE_SETS).map(([name, set]) => ({
    name,
    primary: set.vars["--color-primary"],
    foreground: set.vars["--color-primary-foreground"],
  })),
];

/** One derived monogram fill, as the browser would resolve `oklch(from <primary> calc(l+Δ) calc(c*k) h)` —
 *  the CSS channel keywords clamp, so the arithmetic does too. */
function derivedAvatarFill(primary: string, step: { readonly l: number; readonly c: number }): readonly [number, number, number] {
  const [L, C, H] = parseOklch(primary);
  return [Math.max(0, Math.min(1, L + step.l)), Math.max(0, C * step.c), H];
}

const AVATAR_HUE_MATRIX = AVATAR_PALETTES.flatMap((palette) =>
  Object.entries(AVATAR_HUE_STEPS).map(([bucket, step]) => ({ palette: palette.name, bucket, primary: palette.primary, foreground: palette.foreground, step })),
);

test.each(AVATAR_HUE_MATRIX)("avatar hue $bucket clears AA (≥4.5:1) against $palette's own primary-foreground", ({
  primary,
  foreground,
  step,
  palette,
  bucket,
}) => {
  const ratio = contrast(parseOklch(foreground), derivedAvatarFill(primary, step));
  expect(ratio, `${palette} hue ${bucket} vs primary-foreground = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
});

// …and the steps must stay TELLABLE APART (the ruling's other half: differentiation by lightness/chroma
// within the band). Adjacent-in-lightness buckets that collapse to the same tone are a silent regression a
// contrast guard cannot see, so the spread is asserted directly: no two of the five may resolve to the same
// (L, C) pair on any palette, and the extremes must span at least a real step of lightness.
// The span the AA envelope leaves room for: the window is darken-only (see AVATAR_HUE_STEPS) because a
// light palette's near-white ink caps lightening, so 0.085 is the whole budget and this floor sits just
// under it — a retune that collapses the ramp toward one tone goes red, one that keeps it does not.
const MIN_LIGHTNESS_SPAN = 0.08;

test.each(AVATAR_PALETTES)("$name's five avatar hues stay mutually distinct (lightness × chroma spread)", ({ primary }) => {
  const fills = Object.values(AVATAR_HUE_STEPS).map((step) => derivedAvatarFill(primary, step));
  const keys = new Set(fills.map(([L, C]) => `${L.toFixed(4)}/${C.toFixed(4)}`));
  expect(keys.size, "two hue steps resolve to the same tone").toBe(fills.length);
  const lightnesses = fills.map(([L]) => L);
  expect(Math.max(...lightnesses) - Math.min(...lightnesses)).toBeGreaterThanOrEqual(MIN_LIGHTNESS_SPAN);
});
