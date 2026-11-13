// In a short landscape viewport the dialog body scrolls, and the Link arm's fields start below the mode strip. Choosing the Link
// source brings the Link field into view, clear of the footer that rides the scroll region's bottom edge.
// @subject packages/client/src/features/databank/components/add-document-body.tsx
import { expect, test } from "@playwright/test";
import type { AddDocumentStory } from "./_add-document-stories.tsx";

const STORY = "tests/client/features/databank/components/_add-document-stories/AddDocumentStory";
const DIALOG_FOOTER = '[data-slot="dialog-footer"]';
const SHORT_LANDSCAPE = { width: 844, height: 390 };

test("in short landscape, choosing the Link source brings the Link field into view above the dialog footer", async ({ mount, page }) => {
  await page.setViewportSize(SHORT_LANDSCAPE);
  await mount<typeof AddDocumentStory>(STORY, {});

  await page.getByRole("button", { name: "From a link", exact: true }).click();
  const link = page.getByRole("textbox", { name: "Link", exact: true });
  await expect(link).toBeInViewport({ ratio: 1 });
  // In the viewport is not enough: the sticky footer paints over the scroll body's last rows, so the field's bottom edge has to sit
  // above the footer's top edge.
  const footer = page.locator(DIALOG_FOOTER);
  await expect
    .poll(async () => {
      const linkBox = await link.boundingBox();
      const footerBox = await footer.boundingBox();
      return linkBox === null || footerBox === null ? null : footerBox.y - (linkBox.y + linkBox.height);
    })
    .toBeGreaterThanOrEqual(0);
});
