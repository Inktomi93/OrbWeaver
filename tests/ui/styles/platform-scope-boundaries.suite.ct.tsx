import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { TabsIndicatorStory } from "../primitives/tabs/_indicator-stories.tsx";
import type { ScopeBoundariesStory } from "./_scope-boundaries-stories.tsx";

const STORY = "tests/ui/styles/_scope-boundaries-stories/ScopeBoundariesStory";

test("a card resolves density and radius inside its own theme scope", async ({ mount, page }) => {
  await mount<typeof ScopeBoundariesStory>(STORY, {});
  const card = page.locator('[data-case="scoped-card"]');
  const actual = await card.evaluate(
    (node, tokens) => {
      const style = getComputedStyle(node);
      const probe = document.createElement("div");
      probe.style.padding = `var(${tokens.spacing})`;
      probe.style.borderRadius = `var(${tokens.radius})`;
      node.append(probe);
      const expected = getComputedStyle(probe);
      const result = {
        padding: style.paddingTop,
        radius: style.borderTopLeftRadius,
        expectedPadding: expected.paddingTop,
        expectedRadius: expected.borderTopLeftRadius,
      };
      probe.remove();
      return result;
    },
    { spacing: TOKENS["spacing.block"].cssVar, radius: TOKENS["radius.card"].cssVar },
  );
  expect(actual.padding).toBe(actual.expectedPadding);
  expect(actual.radius).toBe(actual.expectedRadius);
  expect(await card.evaluate((node) => getComputedStyle(node, "::after").borderTopLeftRadius)).toBe(actual.radius);
  const instrument = page.locator('[data-case="instrument-card"]');
  expect(await instrument.evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingTop))).toBeLessThan(Number.parseFloat(actual.padding));
});

test("bounded ScrollArea focus paints inside the clipping root", async ({ mount, page }) => {
  await mount<typeof ScopeBoundariesStory>(STORY, {});
  await page.keyboard.press("Tab");
  const viewport = page.getByRole("region", { name: "Bounded scroll area", exact: true });
  await expect(viewport).toBeFocused();
  await expect(viewport).toHaveCSS("overflow-y", "scroll");
  expect(await viewport.evaluate((node) => getComputedStyle(node).boxShadow)).toContain("inset");
});

for (const dir of ["ltr", "rtl"] as const) {
  test(`the horizontal fallback observes content growth and logical edges in ${dir}`, async ({ mount, page }) => {
    const root = await mount<typeof ScopeBoundariesStory>(STORY, { dir });
    const strip = page.getByRole("region", { name: "Growing strip", exact: true });
    await expect(strip).not.toHaveAttribute("data-fade-end");
    await root.update({ dir, wide: true });
    await expect(strip).toHaveAttribute("data-fade-end", "");
    await strip.evaluate((node, direction) => {
      node.scrollLeft = direction === "rtl" ? -node.scrollWidth : node.scrollWidth;
    }, dir);
    await expect(strip).toHaveAttribute("data-fade-start", "");
    await expect(strip).not.toHaveAttribute("data-fade-end");
  });
}

for (const orientation of ["horizontal", "vertical"] as const) {
  for (const dir of ["ltr", "rtl"] as const) {
    test(`the ${orientation} indicator follows the selected tab in ${dir}`, async ({ mount, page }) => {
      await mount<typeof TabsIndicatorStory>("tests/ui/primitives/tabs/_indicator-stories/TabsIndicatorStory", { orientation, dir });
      const tab = page.getByRole("tab", { name: "A much longer tab", exact: true });
      const indicator = page.locator('[data-slot="tabs-indicator"]');
      await tab.click();
      await expect.poll(() => indicator.evaluate((node) => node.getAnimations().length)).toBe(0);
      const target = await tab.boundingBox();
      await expect
        .poll(async () => {
          const bar = await indicator.boundingBox();
          return orientation === "vertical"
            ? Math.abs((bar?.y ?? Number.NaN) - (target?.y ?? Number.NaN)) + Math.abs((bar?.height ?? Number.NaN) - (target?.height ?? Number.NaN))
            : Math.abs((bar?.x ?? Number.NaN) - (target?.x ?? Number.NaN)) + Math.abs((bar?.width ?? Number.NaN) - (target?.width ?? Number.NaN));
        })
        .toBeLessThan(0.5);
    });
  }
}
