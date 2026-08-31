// The near-duplicate COLOUR lint (packages/ui/tokens.near-duplicate.ts), which tokens.build.ts runs
// inside generateArtifacts — so a violation reds `pnpm --filter @orb/ui tokens:build` AND the freshness
// test. A `.suite.test.ts` because its subject lives at the package ROOT (beside tokens.build.ts, outside
// src/ so src stays browser-pure) and prefix-swaps to no `packages/ui/src/**` module — the documented
// no-single-source-mirror exemption, same shape as tests/ui/tokens/theme-emit-pairing.suite.test.ts.
//
// The pins that matter: the lint BITES on a planted twin and NAMES both paths (a lint that reds without
// saying what to collapse is a wall), a `{reference}` is never a duplicate of its own target, the
// epsilon does not swallow the deliberate elevation ladder, and the sanctioned-exception path works.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_NEAR_PAIRS, assertNoNearDuplicateColors, NEAR_DUPLICATE_EPSILON } from "../../../packages/ui/tokens.near-duplicate.ts";
import { expect, test } from "../../support/fixtures.ts";

const TOKENS_JSON = join(import.meta.dirname, "../../../packages/ui/src/tokens/tokens.json");
const LIGHT_JSON = join(import.meta.dirname, "../../../packages/ui/src/tokens/themes/light.json");
const NEAR_DUPLICATE_RED = /near-duplicate colour pair/u;
const DRIFT_DELTA_E = /ΔE 0\.0010/u;

/** A DTCG fragment shaped like tokens.json's `color` group. */
const color = (l: number, c: number, h: number): Record<string, unknown> => ({ colorSpace: "oklch", components: [l, c, h] });

function tokens(colors: Record<string, unknown>): Record<string, unknown> {
  return { color: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, { $type: "color", $value: v }])) };
}

test("the real tokens.json carries no un-referenced near-duplicate colours", () => {
  const source = JSON.parse(readFileSync(TOKENS_JSON, "utf8")) as Record<string, unknown>;
  const lightSource = JSON.parse(readFileSync(LIGHT_JSON, "utf8")) as Record<string, unknown>;
  expect(() => assertNoNearDuplicateColors(source, { lightSource })).not.toThrow();
});

test("a planted twin REDs and the message names both paths, both values and the ΔE", () => {
  // The defect that minted the lint: a second white 0.005 lighter than --color-foreground.
  const planted = tokens({ foreground: color(0.955, 0.004, 75), "popover-foreground": color(0.96, 0.004, 75) });
  let message = "";
  try {
    assertNoNearDuplicateColors(planted);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message, "the lint must bite on the drift it exists for").not.toBe("");
  expect(message).toContain("color.foreground");
  expect(message).toContain("color.popover-foreground");
  expect(message).toContain("oklch(0.96 0.004 75)");
  expect(message, "the pair's Oklab ΔE must be reported so the caller can judge it").toContain("ΔE 0.0050");
  expect(message, "the message must name the fix, not just the crime").toContain("{color.x}");
});

test("a DTCG {reference} is never a duplicate of its own target — that IS the one-token answer", () => {
  expect(() => assertNoNearDuplicateColors(tokens({ foreground: color(0.955, 0.004, 75), "card-foreground": "{color.foreground}" }))).not.toThrow();
});

test("the epsilon clears the DELIBERATE elevation ladder (0.010 L steps) and catches drift below it", () => {
  const ladder = tokens({ "sidebar-accent": color(0.235, 0.008, 60), popover: color(0.245, 0.007, 60), secondary: color(0.255, 0.007, 60) });
  expect(() => assertNoNearDuplicateColors(ladder), `ΔE 0.010 steps are design, not drift (epsilon ${NEAR_DUPLICATE_EPSILON})`).not.toThrow();
  expect(() => assertNoNearDuplicateColors(tokens({ a: color(0.255, 0.007, 60), b: color(0.255, 0.006, 60) }))).toThrow(DRIFT_DELTA_E);
});

test("split light-dark values are duplicates only when BOTH polarity arms coincide", () => {
  const base = tokens({ destructive: color(0.65, 0.19, 25), other: color(0.3, 0.19, 25) });
  for (const node of Object.values(base["color"] as Record<string, Record<string, unknown>>)) {
    node["$extensions"] = { "orb.output": { kind: "light-dark" } };
  }
  const oneArmLight = tokens({ destructive: color(0.5, 0.19, 25), other: color(0.5, 0.19, 25) });
  expect(() => assertNoNearDuplicateColors(base, { lightSource: oneArmLight })).not.toThrow();

  ((base["color"] as Record<string, Record<string, unknown>>)["other"] ?? {})["$value"] = color(0.653, 0.19, 25);
  const bothArmsLight = tokens({ destructive: color(0.5, 0.19, 25), other: color(0.503, 0.19, 25) });
  expect(() => assertNoNearDuplicateColors(base, { lightSource: bothArmsLight })).toThrow(NEAR_DUPLICATE_RED);
});

test("a plain value and a split light-dark value are different value-spaces — never compared", () => {
  const base = tokens({ plain: color(0.5, 0.19, 25), polar: color(0.5, 0.19, 25) });
  const polar = (base["color"] as Record<string, Record<string, unknown>>)["polar"];
  if (polar === undefined) {
    throw new Error("fixture missing polar token");
  }
  polar["$extensions"] = { "orb.output": { kind: "light-dark" } };
  expect(() => assertNoNearDuplicateColors(base, { lightSource: tokens({ polar: color(0.5, 0.19, 25) }) })).not.toThrow();
});

test("a sanctioned pair passes ONLY via an explicit keyed reason — the exception is never silent", () => {
  const twins = tokens({ a: color(0.255, 0.007, 60), b: color(0.255, 0.006, 60) });
  expect(() => assertNoNearDuplicateColors(twins, { allowed: { "color.a|color.b": "a stated design reason" } })).not.toThrow();
  // The key is the SORTED pair — a mis-keyed entry must not silently exempt anything.
  expect(() => assertNoNearDuplicateColors(twins, { allowed: { "color.b|color.a": "wrong key order" } })).toThrow(NEAR_DUPLICATE_RED);
  expect(Object.keys(ALLOWED_NEAR_PAIRS), "the shipped allowlist is empty — every near-pair the tree had was drift").toStrictEqual([]);
});
