import { DIALOG_VERBS } from "@orb/client/lib";
import { expect, test } from "@playwright/test";
import type { ViewerDialogStory } from "./_dialog-stories.tsx";

const STORY = "tests/client/components/_dialog-stories/ViewerDialogStory";
// Many words, so a word-wrapping floor would hold the row open; a truncating title must still shrink to its ellipsis.
const LONG_TITLE = "Seraphina Valentina Montgomery Blackwood of the Northern Reaches and the Sunken Isles";

test("names the viewer, traps keyboard focus and dismisses through the native close", async ({ mount, page }) => {
  await mount<typeof ViewerDialogStory>(STORY, {});
  const dialog = page.getByRole("dialog", { name: "Recorded content", exact: true });
  await expect(dialog).toBeVisible();
  const controls = dialog.getByRole("button");
  expect(await controls.count()).toBeGreaterThan(1);
  await controls.last().focus();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  await page.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
  await expect(dialog).toBeHidden();
});

for (const width of [390, 1280]) {
  test.describe(`at ${String(width)}x844`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("a long truncating title ends in its ellipsis inside the popup and keeps Close on its line", async ({ mount, page }) => {
      await mount<typeof ViewerDialogStory>(STORY, { title: LONG_TITLE, titleTruncate: true });
      const dialog = page.getByRole("dialog", { name: LONG_TITLE, exact: true });
      const title = dialog.getByRole("heading", { name: LONG_TITLE, exact: true });
      const close = dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true });
      await expect(close).toBeVisible();
      const geometry = await title.evaluate((heading) => ({
        clipped: heading.scrollWidth > heading.clientWidth,
        overflow: getComputedStyle(heading).textOverflow,
      }));
      expect(geometry).toEqual({ clipped: true, overflow: "ellipsis" });
      const [titleBox, closeBox, popupBox] = await Promise.all([title.boundingBox(), close.boundingBox(), dialog.boundingBox()]);
      if (titleBox === null || closeBox === null || popupBox === null) {
        throw new Error("the header did not lay out");
      }
      expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(closeBox.x);
      expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(popupBox.x + popupBox.width);
      // One line: Close's middle sits inside the title's line box.
      const closeMiddle = closeBox.y + closeBox.height / 2;
      expect(closeMiddle).toBeGreaterThanOrEqual(titleBox.y);
      expect(closeMiddle).toBeLessThanOrEqual(titleBox.y + titleBox.height);
    });
  });
}
