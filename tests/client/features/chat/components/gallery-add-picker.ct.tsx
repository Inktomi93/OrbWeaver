// CT: the gallery's add-picker (features/chat/components/gallery-add-picker.tsx), opened from the dialog. The
// server lists only the owner's images not already in this gallery, a keyset page at a time, so "Nothing left
// to add" is a claim about the last page. "Upload instead" hands over to the dialog's upload zone.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcInput, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CharacterGalleryDialogStory } from "../_ct-stories.tsx";
import { ITEM, OWNED_CELL, ownedItem, PAGE_SIZE, STORY_CHARACTER_ID } from "../_gallery-fixtures.ts";

const SECOND_PAGE = 20;
const CANDIDATES = Array.from({ length: PAGE_SIZE + SECOND_PAGE }, (_, index) => ownedItem(index));

/** Serves `CANDIDATES` newest first, a page at a time, continuing after the cursor's row. */
function pagedCandidates(input: TrpcInput<"assets.listOwned">): TrpcWireOutput<"assets.listOwned"> {
  const cursor = input?.cursor;
  const start = cursor === undefined ? 0 : CANDIDATES.findIndex((row) => row.assetId === cursor.assetId) + 1;
  return CANDIDATES.slice(start, start + PAGE_SIZE);
}

async function openPicker(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add images" }).click();
  await expect(page.getByRole("heading", { name: "Add images to the gallery" })).toBeVisible();
}

/** How many owned images the picker's grid lays out: its ARIA row count at its ARIA column count. */
async function pickerCapacity(page: Page): Promise<number> {
  const grid = page.getByRole("grid", { name: "Your images" });
  return Number(await grid.getAttribute("aria-rowcount")) * Number(await grid.getAttribute("aria-colcount"));
}

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: the picker reads this gallery's candidates a page at a time, until the last page`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [ITEM], "assets.listOwned": pagedCandidates });
    await mount(<CharacterGalleryDialogStory />);
    await openPicker(page);

    await expect.poll(() => trpc.lastInput("assets.listOwned")).toEqual({ limit: PAGE_SIZE, galleryCandidatesFor: STORY_CHARACTER_ID, direction: "forward" });
    await expect(page.getByRole("gridcell", { name: OWNED_CELL }).first()).toHaveAccessibleName(/^Image 1, uploaded /u);
    await expect.poll(() => pickerCapacity(page)).toBeGreaterThanOrEqual(PAGE_SIZE);

    const picker = page.getByRole("dialog", { name: "Add images to the gallery" });
    const loadMore = picker.getByRole("button", { name: "Load more" });
    await loadMore.click();
    const lastOfFirstPage = CANDIDATES[PAGE_SIZE - 1];
    await expect
      .poll(() => trpc.lastInput("assets.listOwned"))
      .toEqual({
        limit: PAGE_SIZE,
        galleryCandidatesFor: STORY_CHARACTER_ID,
        cursor: { uploadedAt: lastOfFirstPage?.uploadedAt, assetId: lastOfFirstPage?.assetId },
        direction: "forward",
      });
    await expect.poll(() => pickerCapacity(page)).toBeGreaterThanOrEqual(PAGE_SIZE + SECOND_PAGE);
    await expect(loadMore).toHaveCount(0);
    await expect(picker.getByText("Nothing left to add")).toHaveCount(0);
  });

  test(`${viewport.name}: with nothing left to add, "Upload instead" opens the gallery's file chooser`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "assets.listGallery": () => [ITEM], "assets.listOwned": () => [] });
    await mount(<CharacterGalleryDialogStory />);
    await openPicker(page);

    await expect(page.getByText("Nothing left to add")).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload instead" }).click();
    const opened = await chooser;
    await expect.poll(() => opened.element().getAttribute("data-slot")).toBe("file-dropzone-input");
    await expect(page.getByRole("heading", { name: "Add images to the gallery" })).toHaveCount(0);
  });

  test(`${viewport.name}: the picker footer keeps its selection count on one line`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "assets.listGallery": () => [ITEM], "assets.listOwned": () => CANDIDATES.slice(0, 2) });
    await mount(<CharacterGalleryDialogStory />);
    await openPicker(page);

    const count = page.getByText("0 selected", { exact: true });
    await expect(count).toBeVisible();
    await expect
      .poll(() =>
        count.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          // One rect per text run and line: the count and the word are two runs, so count distinct line tops.
          return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
        }),
      )
      .toBe(1);
  });
}
