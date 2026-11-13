// D336 step four: InlineToken and IndicatorDot each paint their own skin from the tone's roles, under each seed and a nested
// custom scope. Neither draws a hover paint, so no hover media query is read. A status set mixes the Badge's fill styles, so the
// pill is one height whichever style it wears.

import { SEED_SCOPES } from "@orb/testkit/iso";
import { TONES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { BASES } from "../../content/theme-scope/contrast-cases.ts";
import type { BadgeFamilyStory } from "./_badge-family-stories.tsx";

const STORY = "tests/ui/primitives/badge/_badge-family-stories/BadgeFamilyStory";
const CASES = [...SEED_SCOPES, { name: "custom dark scope nested in the light seed", theme: "light" as const, background: BASES[0].background }] as const;

/** One property of one node and the colour or length it must equal, read in one browser round trip (WebKit pays per call). */
interface Reading {
  readonly label: string;
  readonly actual: string;
  readonly expected: string;
}

function readRow(row: Locator): Promise<readonly Reading[]> {
  return row.evaluate((element) => {
    const find = (selector: string): Element => {
      const node = element.querySelector(selector);
      if (node === null) {
        throw new Error(`missing ${selector}`);
      }
      return node;
    };
    const read = (selector: string, property: string, pseudo?: string): string => getComputedStyle(find(selector), pseudo).getPropertyValue(property);
    const role = (name: string): string => read(`[data-probe="${name}"]`, "color");
    const box = (selector: string): string => `${read(selector, "inline-size")} x ${read(selector, "block-size")}`;
    const probeBox = box('[data-probe="dot-box"]');
    const token = '[data-case="inline-token"]';
    const solid = '[data-case="dot-solid"]';
    const ring = '[data-case="dot-outline"]';
    return [
      { label: "token tint", actual: read(token, "background-color"), expected: role("tint") },
      { label: "token ink", actual: read(token, "color"), expected: role("text-on-tint") },
      { label: "token flows in the line", actual: read(token, "display"), expected: "inline" },
      { label: "token draws no border", actual: read(token, "border-block-start-width"), expected: "0px" },
      { label: "token pads its sides at the tight step", actual: read(token, "padding-inline-start"), expected: read('[data-probe="tight"]', "inline-size") },
      { label: "token adds no block padding", actual: read(token, "padding-block-start"), expected: "0px" },
      { label: "token stays selectable", actual: read(token, "user-select"), expected: "text" },
      {
        label: "token leaves its line box alone",
        actual: read('[data-case="run-with-token"]', "block-size"),
        expected: read('[data-case="run-plain"]', "block-size"),
      },
      { label: "solid dot fill", actual: read(solid, "background-color"), expected: role("solid") },
      { label: "solid dot box", actual: box(solid), expected: probeBox },
      { label: "ring fill", actual: read(ring, "background-color"), expected: read('[data-probe="transparent"]', "background-color") },
      { label: "ring edge", actual: read(ring, "border-block-start-color"), expected: role("text") },
      { label: "ring edge width", actual: read(ring, "border-block-start-width"), expected: "1px" },
      { label: "ring box", actual: box(ring), expected: probeBox },
      ...["sm", "compact"].flatMap((size) =>
        ["solid", "outline"].map((variant) => ({
          label: `${size} ${variant} pill is as tall as the soft pill`,
          actual: read(`[data-case="pill-${size}-${variant}"]`, "block-size"),
          expected: read(`[data-case="pill-${size}-soft"]`, "block-size"),
        })),
      ),
    ];
  });
}

for (const { name, ...props } of CASES) {
  test(`${name}: the inline token and the indicator dot paint their own skin from the tone's roles`, async ({ mount }) => {
    const component = await mount<typeof BadgeFamilyStory>(STORY, props);
    for (const tone of TONES) {
      const row = component.locator(`[data-family-tone="${tone}"]`);
      await expect(row).toBeVisible();
      for (const { label, actual, expected } of await readRow(row)) {
        expect.soft(actual, `${tone} ${label}`).toBe(expected);
      }
    }
  });
}
