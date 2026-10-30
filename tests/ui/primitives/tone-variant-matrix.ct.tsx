// D336: every primitive paints each tone and style from the tone's own roles, under each seed and a nested custom scope.
import { AA_NORMAL_RATIO } from "@orb/kit/theme-derivation";
import { pixelContrast } from "@orb/testkit/browser/spec";
import type { ToneRole } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TONES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { BASES } from "../content/theme-scope/contrast-cases.ts";
import type { ToneVariantMatrixStory } from "./_tone-variant-matrix-stories.tsx";

const STORY = "tests/ui/primitives/_tone-variant-matrix-stories/ToneVariantMatrixStory";
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom dark scope nested in the light seed", theme: "light" as const, background: BASES[0].background },
] as const;
// The neutral tone carries no meaning, so a neutral box keeps the quiet edge where a colour tone draws its solid.
function meaningEdge(tone: string): ToneRole {
  return tone === "neutral" ? "edge" : "solid";
}

/** What each painted property must equal: a role of the row's tone, the card fill, or the row's own (inherited) ink. */
type Expected = ToneRole | "card" | "host";
type Paint = Readonly<Record<string, Expected>>;

/** One painted property of one case, read beside the colour its expectation resolves to in the same row. */
interface Reading {
  readonly label: string;
  readonly actual: string;
  readonly expected: string;
}

/** Every case's painted properties in one tone row, read in one browser round trip (WebKit pays per call). */
function readRow(row: Locator, paint: Readonly<Record<string, Paint>>): Promise<readonly Reading[]> {
  return row.evaluate((element, cases) => {
    const colour = (node: Element | null, property: string): string => (node === null ? "missing" : getComputedStyle(node).getPropertyValue(property));
    const resolve = (expectation: string): string =>
      expectation === "host" ? colour(element, "color") : colour(element.querySelector(`[data-probe="${expectation}"]`), "color");
    const readings = Object.entries(cases).flatMap(([kase, properties]) =>
      Object.entries(properties).map(([property, expectation]) => ({
        label: `${kase} ${property}`,
        actual: colour(element.querySelector(`[data-case="${kase}"]`), property),
        expected: resolve(expectation),
      })),
    );
    const glyphs = { icon: "svg[aria-label]", spinner: '[role="status"]', weave: 'svg[aria-hidden="true"]:last-of-type' };
    return [
      ...readings,
      ...Object.entries(glyphs).map(([glyph, selector]) => ({
        label: `${glyph} color`,
        actual: colour([...element.querySelectorAll(selector)].at(-1) ?? null, "color"),
        expected: resolve("text"),
      })),
    ];
  }, paint);
}

function paints(tone: string): Readonly<Record<string, Paint>> {
  const fillLessInk: Expected = tone === "neutral" ? "host" : "text";
  return {
    "button-solid": { "background-color": "solid", color: "foreground" },
    "button-outline": { "border-block-start-color": "edge", color: fillLessInk },
    "button-ghost": { color: fillLessInk },
    "button-link": { color: fillLessInk },
    "badge-solid": { "background-color": "solid", color: "foreground" },
    "badge-soft": { "background-color": "tint", "border-block-start-color": "edge", color: "text-on-tint" },
    "badge-outline": { "border-block-start-color": "edge", color: "text" },
    "card-surface": { "background-color": "card", "border-block-start-color": "edge" },
    "card-soft": { "background-color": "tint", "border-block-start-color": meaningEdge(tone), color: "text-on-tint" },
    "card-outline": { "border-block-start-color": meaningEdge(tone) },
    text: { color: "text" },
  };
}

for (const { name, ...props } of CASES) {
  test(`${name}: every primitive paints each tone and style from the tone's own roles`, async ({ mount }) => {
    const component = await mount<typeof ToneVariantMatrixStory>(STORY, props);
    for (const tone of TONES) {
      const row = component.locator(`[data-matrix-tone="${tone}"]`);
      await expect(row).toBeVisible();
      // Park the pointer away from the controls so every one reads at rest.
      await row.locator('[data-case="text"]').hover();
      for (const { label, actual, expected } of await readRow(row, paints(tone))) {
        expect.soft(actual, `${tone} ${label}`).toBe(expected);
      }
    }
  });

  test(`${name}: each filled and tinted style's ink clears its floor in the painted pixels`, async ({ mount, page }) => {
    const component = await mount<typeof ToneVariantMatrixStory>(STORY, props);
    for (const tone of TONES) {
      const row = component.locator(`[data-matrix-tone="${tone}"]`);
      for (const kase of ["button-solid", "badge-solid", "badge-soft", "card-soft"]) {
        const subject = row.locator(`[data-case="${kase}"]`);
        await subject.scrollIntoViewIfNeeded();
        const receipt = await pixelContrast(page, subject);
        expect(receipt.ratio, `${tone} ${kase}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    }
  });
}
