import { expect, test } from "@playwright/test";
import type { UtilityFallbackStory } from "./_utility-fallback-stories.tsx";

const STORY = "tests/ui/styles/_utility-fallback-stories/UtilityFallbackStory";

test("square, stretched and selection hit targets remain centered on both signed edges", async ({ mount, page }) => {
  await mount<typeof UtilityFallbackStory>(STORY, {});
  const controls = [
    page.getByRole("button", { name: "Square control", exact: true }),
    page.getByRole("button", { name: "Stretched control", exact: true }),
    page.getByRole("checkbox", { name: "Selection control", exact: true }),
  ];
  for (const control of controls) {
    const facts = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const before = getComputedStyle(element, "::before");
      const width = Math.max(rect.width, Number.parseFloat(before.width));
      const height = Math.max(rect.height, Number.parseFloat(before.height));
      const scan = (start: number, end: number, point: (value: number) => readonly [number, number]): { first: number; last: number } => {
        const hits: number[] = [];
        for (let value = Math.floor(start); value <= Math.ceil(end); value += 1) {
          const [x, y] = point(value);
          if (element.contains(document.elementFromPoint(x, y))) {
            hits.push(value);
          }
        }
        const first = hits[0];
        const last = hits.at(-1);
        if (first === undefined || last === undefined) {
          throw new Error("Control has no hit area");
        }
        return { first, last };
      };
      const horizontal = scan(rect.left - width, rect.right + width, (x) => [x, rect.top + rect.height / 2]);
      const vertical = scan(rect.top - height, rect.bottom + height, (y) => [rect.left + rect.width / 2, y]);
      return {
        expectedWidth: width,
        expectedHeight: height,
        width: horizontal.last - horizontal.first + 1,
        height: vertical.last - vertical.first + 1,
        centerXError: Math.abs(horizontal.first + horizontal.last + 1 - rect.left - rect.right),
        centerYError: Math.abs(vertical.first + vertical.last + 1 - rect.top - rect.bottom),
      };
    });
    expect(facts.width).toBeGreaterThanOrEqual(facts.expectedWidth - 1);
    expect(facts.height).toBeGreaterThanOrEqual(facts.expectedHeight - 1);
    expect(facts.centerXError).toBeLessThanOrEqual(2);
    expect(facts.centerYError).toBeLessThanOrEqual(2);
  }
});

test("keyboard focus paints a real ring above property fallback defaults", async ({ mount, page }) => {
  await mount<typeof UtilityFallbackStory>(STORY, {});
  const control = page.getByRole("button", { name: "Square control", exact: true });
  await control.press("Enter");
  await expect(control).toBeFocused();
  const spread = await control.evaluate((element) =>
    Math.max(0, ...Array.from(getComputedStyle(element).boxShadow.matchAll(/0px 0px 0px ([\d.]+)px/g), (match) => Number(match[1]))),
  );
  expect(spread).toBeGreaterThan(0);
});
