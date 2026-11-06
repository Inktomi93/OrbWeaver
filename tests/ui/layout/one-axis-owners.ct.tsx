import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { OneAxisOwnersStory } from "./_one-axis-owners-stories.tsx";

const STORY = "tests/ui/layout/_one-axis-owners-stories/OneAxisOwnersStory";

interface Padding {
  readonly inline: readonly [string, string];
  readonly block: readonly [string, string];
}

function paddingOf(locator: Locator): Promise<Padding> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { inline: [style.paddingLeft, style.paddingRight] as const, block: [style.paddingTop, style.paddingBottom] as const };
  });
}

test.describe("paddingInline and paddingBlock", () => {
  test("paddingInline pads only the inline axis, at the ramp step", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const reference = await paddingOf(component.locator('[data-probe="ref-block"]'));
    const stack = await paddingOf(component.locator('[data-probe="stack-inline"]'));
    expect(stack.inline).toEqual(reference.inline);
    expect(stack.block).toEqual(["0px", "0px"]);
    const row = await paddingOf(component.locator('[data-probe="row-inline"]'));
    expect(row.inline).toEqual((await paddingOf(component.locator('[data-probe="ref-field"]'))).inline);
    expect(row.block).toEqual(["0px", "0px"]);
  });

  test("paddingBlock pads only the block axis, at the ramp step", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const stack = await paddingOf(component.locator('[data-probe="stack-block"]'));
    expect(stack.block).toEqual((await paddingOf(component.locator('[data-probe="ref-section"]'))).block);
    expect(stack.inline).toEqual(["0px", "0px"]);
    const row = await paddingOf(component.locator('[data-probe="row-block"]'));
    expect(row.block).toEqual((await paddingOf(component.locator('[data-probe="ref-row"]'))).block);
    expect(row.inline).toEqual(["0px", "0px"]);
  });

  test("an axis prop overrides the all-sides step on its own axis only", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const padding = await paddingOf(component.locator('[data-probe="stack-override"]'));
    const field = await paddingOf(component.locator('[data-probe="ref-field"]'));
    expect(padding.inline).toEqual(field.inline);
    expect(padding.block).not.toEqual(padding.inline);
  });
});

test.describe("truncate", () => {
  for (const probe of ["text-truncate", "heading-truncate"]) {
    test(`${probe} clips one line with an ellipsis`, async ({ mount }) => {
      const component = await mount<typeof OneAxisOwnersStory>(STORY);
      const line = component.locator(`[data-probe="${probe}"]`);
      await expect(line).toHaveCSS("overflow", "hidden");
      await expect(line).toHaveCSS("text-overflow", "ellipsis");
      await expect(line).toHaveCSS("white-space", "nowrap");
      expect(await line.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    });
  }

  test("text without it wraps", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    await expect(component.locator('[data-probe="text-wrap"]')).toHaveCSS("white-space", "normal");
  });
});
