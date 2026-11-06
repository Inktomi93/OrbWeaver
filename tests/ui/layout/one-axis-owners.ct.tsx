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

test.describe("cap", () => {
  test("a named cap resolves to its token, and fit to the parent's own width", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const reference = await component.locator('[data-probe="ref-column"]').evaluate((element) => getComputedStyle(element).maxWidth);
    await expect(component.locator('[data-probe="stack-cap-column"]')).toHaveCSS("max-width", reference);
    await expect(component.locator('[data-probe="row-cap-fit"]')).toHaveCSS("max-width", "100%");
  });
});

test.describe("corner", () => {
  test("every primitive pins a badge to its parent's block-start, inline-end corner", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const host = await component.locator('[data-probe="corner-host"]').boundingBox();
    expect(host).not.toBeNull();
    // Icon takes no data attribute, so it is addressed as the host's one svg.
    const marks = {
      "corner-badge": component.locator('[data-probe="corner-badge"]'),
      "corner-text": component.locator('[data-probe="corner-text"]'),
      "corner-dot": component.locator('[data-probe="corner-dot"]'),
      "corner-button": component.locator('[data-probe="corner-button"]'),
      "corner-icon": component.locator('[data-probe="corner-host"] > svg'),
    };
    for (const [probe, element] of Object.entries(marks)) {
      await expect(element, probe).toHaveCSS("position", "absolute");
      const box = await element.boundingBox();
      expect(box, probe).not.toBeNull();
      expect(box?.y ?? Number.NaN, probe).toBeLessThan((host?.y ?? 0) + (host?.height ?? 0) / 2);
      expect(box?.x ?? Number.NaN, probe).toBeGreaterThan((host?.x ?? 0) + (host?.width ?? 0) / 2);
    }
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
