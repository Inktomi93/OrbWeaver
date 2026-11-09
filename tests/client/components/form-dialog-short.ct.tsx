// A form dialog on a landscape phone keeps its title and its fields reachable, at the default and at enlarged text.
import { setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { FormDialogCreateStory } from "./_form-dialog-stories.tsx";

const STORY = "tests/client/components/_form-dialog-stories/FormDialogCreateStory";
const ENLARGED_TEXT = 3;

test.use({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });

for (const scale of [1, ENLARGED_TEXT]) {
  test.describe(`at ${scale * 100}% text`, () => {
    test.beforeEach(({ browserName }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    });

    test("the title keeps at least one line", async ({ mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, scale);
      await mount<typeof FormDialogCreateStory>(STORY);
      const title = page.getByRole("dialog").getByRole("heading", { name: "Create a schedule", exact: true });
      await expect(title).toBeVisible();
      await expect
        .poll(async () => await title.evaluate((node) => node.getBoundingClientRect().height >= Number.parseFloat(getComputedStyle(node).lineHeight)))
        .toBe(true);
    });

    test("each field can be scrolled to and is not covered by the footer", async ({ mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, scale);
      await mount<typeof FormDialogCreateStory>(STORY);
      const dialog = page.getByRole("dialog", { name: "Create a schedule", exact: true });
      await expect(dialog).toBeVisible();
      const fields = await dialog.getByRole("textbox").all();
      expect(fields.length).toBeGreaterThan(1);
      for (const field of fields) {
        await field.scrollIntoViewIfNeeded();
        await expect
          .poll(async () =>
            field.evaluate((node) => {
              const box = node.getBoundingClientRect();
              return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === node;
            }),
          )
          .toBe(true);
      }
    });
  });
}
