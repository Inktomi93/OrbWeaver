// iOS Safari zooms the page into a focused field set below 16px and does not always zoom back out, so every shipped
// text field holds the floor at a coarse pointer. Runs on Chromium and on the opt-in webkit-iphone project.
import { expect, test } from "@playwright/test";
import type { FieldFloorStory } from "./_platform-baseline-stories.tsx";

test.use({ hasTouch: true, isMobile: true });

test("every text field holds the 16px zoom floor at a coarse pointer", async ({ mount, page }) => {
  await mount<typeof FieldFloorStory>("tests/ui/styles/_platform-baseline-stories/FieldFloorStory", {});
  const sizes = await Promise.all(
    ["single line", "multi line"].map((name) => page.getByLabel(name, { exact: true }).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))),
  );
  expect(sizes.every((size) => size >= 16)).toBe(true);
});
