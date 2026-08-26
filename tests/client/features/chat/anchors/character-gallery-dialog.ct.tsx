// CT: the per-character gallery lightbox (features/chat/anchors/character-gallery-dialog.tsx) — the two
// side-eye fixes. (a) P0 geometry: the lightbox pins its title + action row and scrolls ONLY the image
// body, so "Remove from gallery" and "Close" stay ON-SCREEN at 1280×800 (and the tighter 1366×768) where
// the old fixed square pushed them past the fold of the non-scrolling popup. (b) P2 destructive-confirm:
// removal now goes through an AlertDialog — `assets.removeFromGallery` does NOT fire on the first click,
// only after the explicit confirm (the chat-delete rule). Network is stubbed via routeTrpc.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { CharacterGalleryDialogStory } from "../_ct-stories.tsx";

const ITEM = {
  galleryItemId: "galleryitem_ct_1",
  assetId: "asset_ct_1",
  hash: "a".repeat(64),
  mime: "image/png",
  animated: false,
  subjectCharacterId: "character_ct_gallery",
  createdAt: 1,
};

const OWNED = [
  { assetId: "asset_ct_owned_1", hash: "b".repeat(64), mime: "image/png", animated: false, kind: "upload" },
  { assetId: "asset_ct_owned_2", hash: "c".repeat(64), mime: "image/png", animated: false, kind: "upload" },
];

async function openLightbox(page: Page): Promise<void> {
  const cell = page.getByRole("gridcell", { name: "Gallery image" });
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.getByRole("button", { name: "Remove from gallery" })).toBeVisible();
}

/** The viewport-space bottom edge of a lightbox action button (throws if it has no layout box). */
async function buttonBottom(page: Page, name: string): Promise<number> {
  const box = await page.getByRole("button", { name }).boundingBox();
  if (box === null) {
    throw new Error(`gallery lightbox CT: "${name}" has no layout box`);
  }
  return box.y + box.height;
}

test("P0: the lightbox action buttons stay on-screen at 1280×800", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await routeTrpc(page, { "assets.listGallery": () => [ITEM] });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  await expect.poll(() => buttonBottom(page, "Remove from gallery")).toBeLessThan(800);
  await expect.poll(() => buttonBottom(page, "Close")).toBeLessThan(800);
});

test("P0: the lightbox action buttons stay on-screen at the tighter 1366×768", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await routeTrpc(page, { "assets.listGallery": () => [ITEM] });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  await expect.poll(() => buttonBottom(page, "Remove from gallery")).toBeLessThan(768);
  await expect.poll(() => buttonBottom(page, "Close")).toBeLessThan(768);
});

test("P2: removal goes through a confirm — the mutation fires only AFTER confirming", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [ITEM],
    "assets.removeFromGallery": () => ({}),
  });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  // First click opens the AlertDialog confirm — it does NOT remove anything yet.
  await page.getByRole("button", { name: "Remove from gallery" }).click();
  await expect(page.getByText("Remove this image?")).toBeVisible();
  await expect.poll(() => trpc.count("assets.removeFromGallery")).toBe(0);

  // Confirming fires the removal with the item's id.
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => trpc.count("assets.removeFromGallery"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => trpc.lastInput("assets.removeFromGallery")).toEqual({ galleryItemId: "galleryitem_ct_1" });
});

test("P2: cancelling the confirm removes nothing", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [ITEM],
    "assets.removeFromGallery": () => ({}),
  });

  await mount(<CharacterGalleryDialogStory />);
  await openLightbox(page);

  await page.getByRole("button", { name: "Remove from gallery" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByText("Remove this image?")).toHaveCount(0);
  await expect.poll(() => trpc.count("assets.removeFromGallery")).toBe(0);
  // The lightbox is still open — cancel is a no-op on the image itself.
  await expect(page.getByRole("button", { name: "Remove from gallery" })).toBeVisible();
});

async function selectOwnedImages(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add images" }).first().click();
  await expect(page.getByText("Add images to the gallery")).toBeVisible();
  const cells = page.getByRole("gridcell", { name: "upload image" });
  await expect(cells).toHaveCount(2);
  await cells.nth(0).click();
  await cells.nth(1).click();
  await expect(page.getByText("2 selected")).toBeVisible();
}

test("the add picker owns the whole held batch, ignores repeat confirmation, and closes after every success", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "assets.listGallery": () => [],
    "assets.listOwned": () => OWNED,
    "assets.addToGallery": hold,
  });
  await mount(<CharacterGalleryDialogStory />);
  await selectOwnedImages(page);
  const confirm = page.getByRole("button", { name: "Add selected" });

  await confirm.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await hold.requested;

  await expect(confirm).toBeDisabled();
  await expect(page.getByText("Add images to the gallery")).toBeVisible();
  expect(trpc.count("assets.addToGallery")).toBe(2);

  hold.release({});
  await expect(page.getByText("Add images to the gallery")).toHaveCount(0);
});

test("a rejected add batch stays visible and retryable, then closes after the retry succeeds", async ({ mount, page }) => {
  const rejected = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  await routeTrpc(page, {
    "assets.listGallery": () => [],
    "assets.listOwned": () => OWNED,
    "assets.addToGallery": () => (attempts++ < OWNED.length ? rejected : retry),
  });
  await mount(<CharacterGalleryDialogStory />);
  await selectOwnedImages(page);
  const confirm = page.getByRole("button", { name: "Add selected" });

  await confirm.click();
  await rejected.requested;
  rejected.release(trpcError());

  await expect(page.getByRole("alert")).toContainText("Couldn't add the selected images to the gallery.");
  await expect(confirm).toBeEnabled();
  await expect(page.getByText("Add images to the gallery")).toBeVisible();

  await confirm.click();
  await retry.requested;
  retry.release({});
  await expect(page.getByText("Add images to the gallery")).toHaveCount(0);
});
