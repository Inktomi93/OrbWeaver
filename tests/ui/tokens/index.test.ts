// The derived-theme FRESHNESS gate (UI-Architecture §3, D42: "the Tailwind theme is DERIVED, never
// hand-authored — drift is impossible by construction"). This test IS the construction: it re-runs
// the codegen from src/tokens/tokens.json and byte-compares against the committed artifacts, so a
// hand-edited theme.css/index.ts OR a tokens.json edit without `pnpm --filter @orb/ui tokens:build`
// fails `pnpm test`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOKENS } from "@orb/ui/tokens";
import { generateArtifacts } from "../../../packages/ui/tokens.build.ts";
import { expect, test } from "../../support/fixtures";

const UI_ROOT = join(import.meta.dirname, "../../../packages/ui");

/** The emitted pointer-fine override block — its `:root { … }` body is capture group 1. */
const FINE_BLOCK_RE = /@media \(pointer: fine\) \{\s*:root \{([\s\S]*?)\}\s*\}/u;

test("theme.css and tokens/index.ts are exactly what tokens.json derives (no drift, no hand edits)", async () => {
  const { themeCss, tokensTs } = await generateArtifacts();
  expect(readFileSync(join(UI_ROOT, "src/styles/theme.css"), "utf8")).toBe(themeCss);
  expect(readFileSync(join(UI_ROOT, "src/tokens/index.ts"), "utf8")).toBe(tokensTs);
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

test("the load-bearing token names exist (scrim · chart ramp · the D44 §12.1 override targets)", async () => {
  const { themeCss } = await generateArtifacts();
  const required = [
    "--color-scrim",
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

// The AA guard for the Avatar deterministic fallback hue (D62): the ONE foreground
// (`--color-primary-foreground`) must clear WCAG AA (≥4.5:1, small text) against ALL FIVE chart hues
// it pairs with — a hard ship-gate. A token-VALUE invariant (reads only TOKENS, browser-independent),
// so it lives with the other token invariants. Math: oklch → linear sRGB (Björn Ottosson's OKLab
// matrix) → relative luminance → the WCAG contrast ratio. Any hue regressing below 4.5 (a token
// retune) goes red before a low-contrast avatar can ship.
const AA_SMALL_TEXT = 4.5;
const OKLCH_RE = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/u;

function parseOklch(value: string): readonly [number, number, number] {
  const m = OKLCH_RE.exec(value);
  if (m === null) {
    throw new Error(`token is not an oklch literal: ${value}`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

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

function contrast(fg: string, bg: string): number {
  const lf = relLuminance(parseOklch(fg));
  const lb = relLuminance(parseOklch(bg));
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

const HUE_TOKENS = ["color.chart-1", "color.chart-2", "color.chart-3", "color.chart-4", "color.chart-5"] as const;

test.each(HUE_TOKENS)("%s clears AA (≥4.5:1) against --color-primary-foreground (the avatar fallback-hue guard)", (hue) => {
  const ratio = contrast(TOKENS["color.primary-foreground"].value, TOKENS[hue].value);
  expect(ratio, `${hue} vs primary-foreground = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
});
