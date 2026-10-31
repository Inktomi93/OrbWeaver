// D336 step 4d: the focal section, the aria-current box and the tone-stamped divider paint through their own doors.
import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MID_GREY } from "../content/theme-scope/contrast-cases.ts";
import type { CurrentBoxesStory, DividerToneStory, FocalSectionStory } from "./_visual-state-boxes-stories.tsx";

const STORIES = "tests/ui/layout/_visual-state-boxes-stories";
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY },
] as const;

function style(locator: Locator, property: string, pseudo?: string): Promise<string> {
  return locator.evaluate((element, [name, pseudoElement]) => getComputedStyle(element, pseudoElement).getPropertyValue(name), [property, pseudo] as const);
}

const caseOf = (root: Locator, name: string): Locator => root.locator(`[data-case="${name}"]`);
const probeOf = (root: Locator, name: string): Locator => root.locator(`[data-probe="${name}"]`);

for (const { name, ...props } of CASES) {
  test(`${name}: a focal section wears the speaker edge ring and glow on a rounded box with no one-sided border, an unfocal one is the plain section, and neither changes element`, async ({
    mount,
  }) => {
    const root = await mount<typeof FocalSectionStory>(`${STORIES}/FocalSectionStory`, props);
    const focal = caseOf(root, "focal");
    const unfocal = caseOf(root, "unfocal");
    const plain = caseOf(root, "plain");
    expect(await focal.evaluate((element) => element.tagName)).toBe("SECTION");
    expect(await unfocal.evaluate((element) => element.tagName)).toBe("SECTION");
    // A border on one edge of a rounded box is the generated-UI side-tab shape: the focal draws its edge as a ring, so every border side is the same width.
    const sides = await Promise.all(["top", "right", "bottom", "left"].map((side) => style(focal, `border-${side}-width`)));
    expect(new Set(sides).size, `border widths ${sides.join(" ")}`).toBe(1);
    expect(await style(focal, "border-top-left-radius")).not.toBe("0px");
    expect(await style(focal, "box-shadow")).toContain(await style(probeOf(root, "speaker"), "color"));
    expect(await style(focal, "box-shadow", "::before")).not.toBe("none");
    for (const quiet of [unfocal, plain]) {
      expect(await style(quiet, "border-inline-start-width")).toBe("0px");
      expect(await style(quiet, "box-shadow", "::before")).toBe("none");
    }
    expect(await style(unfocal, "padding-inline-start")).toBe(await style(plain, "padding-inline-start"));
  });

  test(`${name}: an aria-current box paints the neutral tint and quiet edge, a resting one draws nothing, and both lay out as their bare twin`, async ({
    mount,
  }) => {
    const root = await mount<typeof CurrentBoxesStory>(`${STORIES}/CurrentBoxesStory`, props);
    const tint = await style(probeOf(root, "tint"), "background-color");
    const transparent = await style(probeOf(root, "stack"), "background-color");
    const stack = caseOf(root, "stack-current");
    expect(await style(stack, "background-color"), "stack").toBe(tint);
    expect(await style(stack, "box-shadow"), "stack").not.toBe("none");
    expect(await style(caseOf(root, "stack-rest"), "box-shadow"), "stack").toBe("none");
    expect(await style(stack, "row-gap"), "stack").toBe(await style(caseOf(root, "stack-rest"), "row-gap"));
    // The grid's mark is a layer outset by the tight step, so the box itself paints nothing and stays where it was.
    const grid = caseOf(root, "grid-current");
    const gridRest = caseOf(root, "grid-rest");
    expect(await style(grid, "background-color"), "grid box").toBe(transparent);
    expect(await style(grid, "box-shadow"), "grid box").toBe("none");
    expect(await style(grid, "background-color", "::before"), "grid mark fill").toBe(tint);
    expect(await style(gridRest, "box-shadow", "::before"), "grid rest").toBe("none");
    expect(await style(grid, "row-gap"), "grid").toBe(await style(gridRest, "row-gap"));
    const tight = await style(probeOf(root, "tight"), "inline-size");
    for (const side of ["inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end"]) {
      expect(await style(grid, side, "::before"), side).toBe(`-${tight}`);
    }
    expect(await style(grid, "box-shadow", "::before"), "grid ring colour").toContain(await style(probeOf(root, "ring"), "background-color"));
    const twin = probeOf(root, "stack");
    for (const property of ["display", "flex-direction", "row-gap"]) {
      expect(await style(caseOf(root, "stack-rest"), property), property).toBe(await style(twin, property));
    }
  });

  test(`${name}: the grid mark's ring holds the non-text floor against the page`, async ({ mount, page }) => {
    const root = await mount<typeof CurrentBoxesStory>(`${STORIES}/CurrentBoxesStory`, props);
    const ring = await pixelSurface(page, probeOf(root, "ring"));
    const ground = await pixelSurface(page, probeOf(root, "ground"));
    expect(wcagContrastRatio(ring.rgb, ground.rgb), `${ring.describe} on ${ground.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  });

  test(`${name}: a primary and a warning divider paint the stamped tone's solid role, and an unstamped one keeps the border ink`, async ({ mount }) => {
    const root = await mount<typeof DividerToneStory>(`${STORIES}/DividerToneStory`, props);
    for (const [kase, probe] of [
      ["row-primary", "probe-primary"],
      ["stack-warning", "probe-warning"],
    ] as const) {
      expect(await style(caseOf(root, kase), "border-inline-start-width"), kase).toBe("2px");
      expect(await style(caseOf(root, kase), "border-inline-start-color"), kase).toBe(await style(caseOf(root, probe), "border-top-color"));
    }
    expect(await style(caseOf(root, "row-plain"), "border-inline-start-color")).not.toBe(await style(caseOf(root, "probe-primary"), "border-top-color"));
    await expect(caseOf(root, "row-primary")).toHaveAttribute("data-tone", "primary");
    await expect(caseOf(root, "row-plain")).not.toHaveAttribute("data-tone");
  });
}
