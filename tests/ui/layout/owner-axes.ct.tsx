import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { OwnerAxesStory } from "./_owner-axes-stories.tsx";

const STORY = "tests/ui/layout/_owner-axes-stories/OwnerAxesStory";

const inlineSize = (locator: Locator): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().width);

const boxOf = (locator: Locator): Promise<{ readonly width: number; readonly height: number }> =>
  locator.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });

test.describe("Skeleton takes the size of the box it stands in for", () => {
  test("a control step, a voice's line box and a picture", async ({ mount }) => {
    const component = await mount<typeof OwnerAxesStory>(STORY);
    const probe = (name: string): Locator => component.locator(`[data-probe="${name}"]`);
    expect((await boxOf(probe("skeleton-control"))).height).toBe((await boxOf(probe("ref-control"))).height);
    expect((await boxOf(probe("skeleton-half"))).height).toBe((await boxOf(probe("ref-label"))).height);
    expect(await boxOf(probe("skeleton-avatar"))).toEqual(await boxOf(probe("ref-avatar")));
  });

  test("a line share, the rest of a row and the whole of its host", async ({ mount }) => {
    const component = await mount<typeof OwnerAxesStory>(STORY);
    const probe = (name: string): Locator => component.locator(`[data-probe="${name}"]`);
    const full = (await boxOf(probe("skeleton-control"))).width;
    expect((await boxOf(probe("skeleton-half"))).width).toBe(full / 2);
    expect((await boxOf(probe("skeleton-grow"))).width).toBeGreaterThan(full / 2);
    expect(await boxOf(probe("skeleton-cover"))).toEqual(await boxOf(probe("skeleton-host")));
  });
});

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
