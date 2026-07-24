// CT: the per-character gallery lightbox (features/chat/anchors/character-gallery-dialog.tsx) — the two
// side-eye fixes. (a) P0 geometry: the lightbox pins its title + action row and scrolls ONLY the image
// body, so "Remove from gallery" and "Close" stay ON-SCREEN at 1280×800 (and the tighter 1366×768) where
// the old fixed square pushed them past the fold of the non-scrolling popup. (b) P2 destructive-confirm:
// removal now goes through an AlertDialog — `assets.removeFromGallery` does NOT fire on the first click,
// only after the explicit confirm (the chat-delete rule). Network is stubbed via routeTrpc.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharacterGalleryDialogStory } from "../_ct-stories";

const ITEM = {
  galleryItemId: "galleryitem_ct_1",
  assetId: "asset_ct_1",
  hash: "a".repeat(64),
  mime: "image/png",
  animated: false,
  subjectCharacterId: "character_ct_gallery",
  createdAt: 1,
};

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
