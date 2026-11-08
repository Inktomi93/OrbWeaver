// D336 step 4d: the focal section, the aria-current box and the tone-stamped divider paint through their own doors.
import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { computedStyle, pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { CurrentBoxesStory, DividerToneStory, FocalSectionStory } from "./_visual-state-boxes-stories.tsx";

const STORIES = "tests/ui/layout/_visual-state-boxes-stories";

const caseOf = (root: Locator, name: string): Locator => root.locator(`[data-case="${name}"]`);
const probeOf = (root: Locator, name: string): Locator => root.locator(`[data-probe="${name}"]`);

for (const { name, ...props } of SEED_CASES) {
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
    const sides = await Promise.all(["top", "right", "bottom", "left"].map((side) => computedStyle(focal, `border-${side}-width`)));
    expect(new Set(sides).size, `border widths ${sides.join(" ")}`).toBe(1);
    expect(await computedStyle(focal, "border-top-left-radius")).not.toBe("0px");
    expect(await computedStyle(focal, "box-shadow")).toContain(await computedStyle(probeOf(root, "speaker"), "color"));
    expect(await computedStyle(focal, "box-shadow", "::before")).not.toBe("none");
    for (const quiet of [unfocal, plain]) {
      expect(await computedStyle(quiet, "border-inline-start-width")).toBe("0px");
      expect(await computedStyle(quiet, "box-shadow", "::before")).toBe("none");
    }
    expect(await computedStyle(unfocal, "padding-inline-start")).toBe(await computedStyle(plain, "padding-inline-start"));
  });

  test(`${name}: an aria-current box paints the neutral tint and quiet edge, a resting one draws nothing, and both lay out as their bare twin`, async ({
    mount,
  }) => {
    const root = await mount<typeof CurrentBoxesStory>(`${STORIES}/CurrentBoxesStory`, props);
    const tint = await computedStyle(probeOf(root, "tint"), "background-color");
    const transparent = await computedStyle(probeOf(root, "stack"), "background-color");
    const stack = caseOf(root, "stack-current");
    expect(await computedStyle(stack, "background-color"), "stack").toBe(tint);
    expect(await computedStyle(stack, "box-shadow"), "stack").not.toBe("none");
    expect(await computedStyle(caseOf(root, "stack-rest"), "box-shadow"), "stack").toBe("none");
    expect(await computedStyle(stack, "row-gap"), "stack").toBe(await computedStyle(caseOf(root, "stack-rest"), "row-gap"));
    // The grid's mark is a layer outset by the tight step, so the box itself paints nothing and stays where it was.
    const grid = caseOf(root, "grid-current");
    const gridRest = caseOf(root, "grid-rest");
    expect(await computedStyle(grid, "background-color"), "grid box").toBe(transparent);
    expect(await computedStyle(grid, "box-shadow"), "grid box").toBe("none");
    expect(await computedStyle(grid, "background-color", "::before"), "grid mark fill").toBe(tint);
    expect(await computedStyle(gridRest, "box-shadow", "::before"), "grid rest").toBe("none");
    expect(await computedStyle(grid, "row-gap"), "grid").toBe(await computedStyle(gridRest, "row-gap"));
    const tight = await computedStyle(probeOf(root, "tight"), "inline-size");
    for (const side of ["inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end"]) {
      expect(await computedStyle(grid, side, "::before"), side).toBe(`-${tight}`);
    }
    expect(await computedStyle(grid, "box-shadow", "::before"), "grid ring colour").toContain(await computedStyle(probeOf(root, "ring"), "background-color"));
    const twin = probeOf(root, "stack");
    for (const property of ["display", "flex-direction", "row-gap"]) {
      expect(await computedStyle(caseOf(root, "stack-rest"), property), property).toBe(await computedStyle(twin, property));
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
      expect(await computedStyle(caseOf(root, kase), "border-inline-start-width"), kase).toBe("2px");
      expect(await computedStyle(caseOf(root, kase), "border-inline-start-color"), kase).toBe(await computedStyle(caseOf(root, probe), "border-top-color"));
    }
    expect(await computedStyle(caseOf(root, "row-plain"), "border-inline-start-color")).not.toBe(
      await computedStyle(caseOf(root, "probe-primary"), "border-top-color"),
    );
    await expect(caseOf(root, "row-primary")).toHaveAttribute("data-tone", "primary");
    await expect(caseOf(root, "row-plain")).not.toHaveAttribute("data-tone");
  });
}
