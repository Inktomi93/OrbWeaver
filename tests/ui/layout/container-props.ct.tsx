import { expect, test } from "@playwright/test";
import type { ContainerPropsStory } from "./container-props-stories.tsx";

const NARROW_PX = 300;
const WIDE_PX = 700;
const STORY = "tests/ui/layout/container-props-stories/ContainerPropsStory";
const WIDTH_TRACKS = [
  [NARROW_PX, 1],
  [WIDE_PX, 2],
] as const;

test.describe("a box that declares its own container", () => {
  for (const probe of ["container", "section", "stack"] as const) {
    for (const [width, tracks] of WIDTH_TRACKS) {
      test(`the ${probe} box lays its descendants out in ${String(tracks)} track(s) at ${String(width)}px`, async ({ mount }) => {
        const component = await mount<typeof ContainerPropsStory>(STORY, { width });
        const columns = await component.locator(`[data-probe="${probe}"]`).evaluate((element) => getComputedStyle(element).gridTemplateColumns);
        expect(columns.split(" ")).toHaveLength(tracks);
      });
    }
  }

  for (const [width, direction] of [
    [NARROW_PX, "column"],
    [WIDE_PX, "row"],
  ] as const) {
    test(`a settings row inside a section box lays out as a ${direction} at ${String(width)}px`, async ({ mount }) => {
      const component = await mount<typeof ContainerPropsStory>(STORY, { width });
      await expect(component.locator('[data-slot="field-root"]')).toHaveCSS("flex-direction", direction);
    });
  }

  test("a size container also resolves block-axis container units", async ({ mount }) => {
    const component = await mount<typeof ContainerPropsStory>(STORY, { width: WIDE_PX });
    await expect(component.locator('[data-probe="size"]')).toHaveCSS("height", "100px");
  });
});
