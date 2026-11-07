import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { OwnerAxesStory } from "./_owner-axes-stories.tsx";

const STORY = "tests/ui/layout/_owner-axes-stories/OwnerAxesStory";

const inlineSize = (locator: Locator): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().width);

test.describe("cap", () => {
  test("Text stops at the prose measure, in its own font", async ({ mount }) => {
    const component = await mount<typeof OwnerAxesStory>(STORY);
    const capped = await inlineSize(component.locator('[data-probe="text-cap-prose"]'));
    const reference = await inlineSize(component.locator('[data-probe="ref-prose"]'));
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThan(await inlineSize(component));
    expect(capped).toBeCloseTo(reference, 0);
  });

  test("Heading takes the same table", async ({ mount }) => {
    const component = await mount<typeof OwnerAxesStory>(STORY);
    const maxInline = await component.locator('[data-probe="heading-cap-reading"]').evaluate((element) => getComputedStyle(element).maxInlineSize);
    expect(maxInline).not.toBe("none");
  });
});
