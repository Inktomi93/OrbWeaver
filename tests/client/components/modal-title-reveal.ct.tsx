// @subject packages/client/src/components/modal-title.tsx
// @subject packages/client/src/components/form-dialog.tsx
// @subject packages/client/src/components/sheet-dialog.tsx
// @subject packages/client/src/components/content-dialog.tsx
// A short window cuts a dialog or sheet title to one line, and the cut title follows the chrome title reveal rule (ui-platform-rulings §8.2): the
// modal keeps the whole title as its name, the cut title is a control that reaches the touch floor, and its press opens the whole text without
// closing the modal. A title the line seats whole, or a tall window that lets it wrap, carries no control.

import { hitExtent, PLATFORM_TEXT_SCALES, setPlatformTextSize, touchFloorPx } from "@orb/testkit/browser/spec";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ViewerDialogStory } from "./_dialog-stories.tsx";
import type { FormDialogTitleStory, SheetDialogTitleStory } from "./_form-dialog-stories.tsx";

const LONG_TITLE =
  "Rename the lighthouse keeper's long vigil through the whole of the storm season, from the first gale on the headland to the last calm morning on the harbour wall";
const SHORT_TITLE = "Vigil";
// A sheet's short step reads the room its viewport leaves, which a landscape phone at the default text clears only below the 24rem step, so the
// sheet's window is the shorter landscape phone; the dialog's is the landscape phone every short-window case uses.
const MODALS = [
  { label: "dialog", story: "tests/client/components/_form-dialog-stories/FormDialogTitleStory", viewport: { width: 844, height: 390 } },
  // A viewer's title sits in a row beside its header close, where a title that cannot shrink would run under the close.
  { label: "viewer", story: "tests/client/components/_dialog-stories/ViewerDialogStory", viewport: { width: 844, height: 390 } },
  { label: "sheet", story: "tests/client/components/_form-dialog-stories/SheetDialogTitleStory", viewport: { width: 667, height: 375 } },
] as const;

type TitleStory = typeof FormDialogTitleStory | typeof SheetDialogTitleStory | typeof ViewerDialogStory;

// `elementFromPoint` answers null off the screen and a finger cannot land past its edge, so a control near the edge owes the part of its floor
// band the screen holds (tests/support/browser/touch-floor.ts centres a control for the same reason; a modal's title cannot scroll).
async function floorOnScreen(page: Page, control: Locator, floor: number): Promise<number> {
  const box = await control.boundingBox();
  const height = page.viewportSize()?.height;
  if (box === null || height === undefined) {
    throw new Error("The cut title has no box in a sized viewport");
  }
  const centre = box.y + box.height / 2;
  return Math.min(centre + floor / 2, height) - Math.max(centre - floor / 2, 0);
}

for (const modal of MODALS) {
  test.describe(`a short landscape ${modal.label}`, () => {
    test.use({ viewport: modal.viewport, hasTouch: true, isMobile: true });

    for (const scale of PLATFORM_TEXT_SCALES) {
      test(`at ${String(scale * 100)}% text a cut title opens whole by a tap and leaves the ${modal.label} open`, async ({ browserName, mount, page }) => {
        test.skip(browserName !== "chromium" && scale !== 1, "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
        await using _textSize = await setPlatformTextSize(page, scale);
        await mount<TitleStory>(modal.story, { title: LONG_TITLE });
        await expect(page.getByRole("dialog", { name: LONG_TITLE, exact: true })).toHaveCount(1);
        // The modal holds the heading and the reveal holds none, which tells them apart while both carry the title.
        const heading = page.getByRole("heading", { name: LONG_TITLE, exact: true });
        const held = page.getByRole("dialog").filter({ has: heading });
        const reveal = page.getByRole("dialog").filter({ hasNot: page.getByRole("heading") });
        const control = heading.getByRole("button", { name: LONG_TITLE, exact: true });
        await expect(control).toBeInViewport({ ratio: 1 });
        await page.evaluate(() => document.fonts.ready);
        const floor = await touchFloorPx(page);
        expect(await hitExtent(control, "y")).toBeGreaterThanOrEqual(await floorOnScreen(page, control, floor));
        expect(await hitExtent(control, "x")).toBeGreaterThanOrEqual(floor);

        await control.tap();
        await expect(reveal).toContainText(LONG_TITLE);
        await page.keyboard.press("Escape");
        await expect(reveal).toHaveCount(0);
        await expect(held).toHaveCount(1);
        await expect(control).toBeFocused();
      });
    }

    test("a title the line seats whole carries no control", async ({ mount, page }) => {
      await mount<TitleStory>(modal.story, { title: SHORT_TITLE });
      const heading = page.getByRole("dialog", { name: SHORT_TITLE, exact: true }).getByRole("heading");
      await expect(heading).toHaveText(SHORT_TITLE);
      await expect(heading.getByRole("button")).toHaveCount(0);
    });
  });
}

test.describe("a desktop window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a long dialog title wraps whole and carries no control", async ({ mount, page }) => {
    await mount<typeof FormDialogTitleStory>(MODALS[0].story, { title: LONG_TITLE });
    const heading = page.getByRole("dialog", { name: LONG_TITLE, exact: true }).getByRole("heading");
    await expect(heading).toHaveText(LONG_TITLE);
    await expect(heading.getByRole("button")).toHaveCount(0);
  });
});
