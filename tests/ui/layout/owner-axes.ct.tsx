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

test("Row wrap takes a second line where the same children would overflow one", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const wrapped = await boxOf(component.locator('[data-probe="row-wrap"]'));
  const unwrapped = await boxOf(component.locator('[data-probe="row-nowrap"]'));
  expect(wrapped.height).toBe(unwrapped.height * 2);
});

test("paddingBlockEnd pads the block-end edge alone, at the ramp step", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const padding = (name: string): Promise<readonly [string, string]> =>
    component.locator(`[data-probe="${name}"]`).evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.paddingBlockStart, style.paddingBlockEnd] as const;
    });
  const section = await padding("ref-pad-section");
  const tight = await padding("ref-pad-tight");
  expect(await padding("stack-pad-end")).toEqual(["0px", section[1]]);
  expect(await padding("row-pad-end")).toEqual(["0px", tight[1]]);
});

test("push sends the free space of the line to the side it names", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const edges = (name: string): Promise<{ readonly right: number; readonly bottom: number }> =>
    component.locator(`[data-probe="${name}"]`).evaluate((element) => {
      const { right, bottom } = element.getBoundingClientRect();
      return { right, bottom };
    });
  expect((await edges("text-push-end")).right).toBe((await edges("push-host")).right);
  expect((await edges("row-push-foot")).bottom).toBe((await edges("push-column")).bottom);
});

test("InlineToken leads keeps a field step before the words and a plain token keeps none", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const marginEnd = (name: string): Promise<string> =>
    component.locator(`[data-probe="${name}"]`).evaluate((element) => getComputedStyle(element).marginInlineEnd);
  expect(await marginEnd("token-plain")).toBe("0px");
  expect(await marginEnd("token-leads")).not.toBe("0px");
});

test("hiddenAt empty takes an empty box out and leaves a box that holds a child, and always takes any box out", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const display = (name: string): Promise<string> => component.locator(`[data-probe="${name}"]`).evaluate((element) => getComputedStyle(element).display);
  expect(await display("stack-held")).toBe("flex");
  expect(await display("stack-empty")).toBe("none");
  expect(await display("stack-always")).toBe("none");
});

test("minHeight and minWidth hold a box at the control it seats", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const floor = (await boxOf(component.locator('[data-probe="ref-control"]'))).height;
  expect((await boxOf(component.locator('[data-probe="row-floor"]'))).height).toBe(floor);
  const stackFloor = await component.locator('[data-probe="stack-floor"]').evaluate((element) => Number.parseFloat(getComputedStyle(element).minInlineSize));
  expect(stackFloor).toBe(floor);
});

test("textAlign, inset and cluster set a run's lines, inset and glyph gap", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const read = (name: string, property: "textAlign" | "paddingInlineStart" | "display" | "columnGap"): Promise<string> =>
    component.locator(`[data-probe="${name}"]`).evaluate((element, key) => getComputedStyle(element)[key], property);
  expect(await read("text-end", "textAlign")).toBe("end");
  expect(await read("text-inset", "paddingInlineStart")).not.toBe("0px");
  expect(await read("text-cluster", "display")).toBe("inline-flex");
  expect(await read("text-cluster", "columnGap")).not.toBe("normal");
});

test("grow gives a Separator and an Input the room left on their line", async ({ mount }) => {
  const component = await mount<typeof OwnerAxesStory>(STORY);
  const rule = await boxOf(component.locator('[data-probe="separator-grow"]'));
  const field = await boxOf(component.locator('[data-probe="input-grow"]'));
  expect(rule.width).toBeGreaterThan(0);
  expect(field.width).toBeGreaterThan(0);
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
