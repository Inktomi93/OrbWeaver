// CT: the gallery dialog's upload zone (features/chat/components/gallery-upload-zone.tsx), mounted in the dialog.
// A picked or dropped image uploads as a `gallery` asset and joins this character's gallery. Every refusal (the
// dropzone's own type and size checks, a server refusal with its reason, a failed add) is said once, on the
// dropzone's own error line, and each batch starts from a clean zone.

import { expect, test } from "@playwright/experimental-ct-react";
import { dropFiles } from "../../../../support/browser/drop-files.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CharacterGalleryDialogStory, CharacterGalleryDialogToastStory } from "../_ct-stories.tsx";
import {
  capImageUploads,
  DROPZONE,
  DROPZONE_ERROR,
  GALLERY_CELL,
  galleryAfterAdd,
  holdUploads,
  IMAGE_CAP_BYTES,
  LARGE_PNG,
  NOT_AN_IMAGE,
  recordUploads,
  SMALL_PNG,
  STORY_CHARACTER_ID,
  TOAST_ROOT,
  UPLOADED,
  UPLOADED_ITEM,
} from "../_gallery-fixtures.ts";

const CAP_HINT = `Up to ${String(IMAGE_CAP_BYTES)} B per file`;
const SPOOF_REASON = "its contents are not a PNG, JPEG, GIF or WebP image";
const UNSUPPORTED_MEDIA_TYPE = 415;
/** A camera-roll name with no break opportunity, longer than the desktop dialog is wide. */
const LONG_NAME = `${"IMG_20260927_174512_BURST0001_COVER_".repeat(8)}.png`;
const SECOND_PNG = { name: "dawn.png", mimeType: "image/png", content: "PNGDAWN" };

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: a picked image uploads as a gallery asset and joins this character's gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    let added = false;
    const trpc = await routeTrpc(page, {
      "assets.listGallery": galleryAfterAdd(() => added),
      "assets.addToGallery": () => {
        added = true;
        return UPLOADED_ITEM;
      },
    });
    await mount(<CharacterGalleryDialogStory />);

    await expect(page.getByText("No images yet")).toBeVisible();
    const zone = page.locator(DROPZONE);
    await expect(zone).toBeInViewport();
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await zone.locator('input[type="file"]').setInputFiles({ name: SMALL_PNG.name, mimeType: SMALL_PNG.mimeType, buffer: Buffer.from(SMALL_PNG.content) });

    await expect(page.getByRole("gridcell", { name: GALLERY_CELL })).toHaveCount(1);
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => uploads[0]).toMatch(/name="kind"\s+gallery/u);
    await expect.poll(() => trpc.lastInput("assets.addToGallery")).toEqual({ assetId: UPLOADED.assetId, subjectCharacterId: STORY_CHARACTER_ID });
  });

  test(`${viewport.name}: a dropped image takes the same path into the gallery`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    let added = false;
    const trpc = await routeTrpc(page, {
      "assets.listGallery": galleryAfterAdd(() => added),
      "assets.addToGallery": () => {
        added = true;
        return UPLOADED_ITEM;
      },
    });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);

    await expect(page.getByRole("gridcell", { name: GALLERY_CELL })).toHaveCount(1);
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => trpc.lastInput("assets.addToGallery")).toEqual({ assetId: UPLOADED.assetId, subjectCharacterId: STORY_CHARACTER_ID });
  });

  test(`${viewport.name}: a wrong type or an oversize image is refused on the dropzone's line and nothing uploads`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [], "assets.addToGallery": () => UPLOADED_ITEM });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [NOT_AN_IMAGE, LARGE_PNG]);

    await expect(zone.locator(DROPZONE_ERROR)).toContainText(
      `notes.txt isn't an accepted file type · poster.png exceeds the ${String(IMAGE_CAP_BYTES)} B limit`,
    );
    await expect.poll(() => uploads.length).toBe(0);
    await expect.poll(() => trpc.count("assets.addToGallery")).toBe(0);
  });

  test(`${viewport.name}: an upload whose gallery add fails is named on the dropzone's line, with no success mark and no toast`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page);
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [], "assets.addToGallery": () => trpcError({ code: "NOT_FOUND", message: "not found" }) });
    await mount(<CharacterGalleryDialogToastStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);

    const line = zone.locator(DROPZONE_ERROR);
    await expect(line).toContainText("sunset.png uploaded but couldn't join Aria's gallery. It stays in your uploads.");
    await expect(line).toBeInViewport();
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => trpc.count("assets.addToGallery")).toBe(1);
    // The upload landed but the picture joined nothing: the zone claims no success, and the line is the one surface.
    await expect(zone).not.toHaveAttribute("data-success", "");
    // A retrying toHaveCount(0) passes before a late toast paints. The mutation cache's toast hook runs before
    // the rejection reaches the zone, so two frames past the rendered line is a settled read.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the toast hook fired before the line rendered, and two frames have painted since.
    expect(await page.locator(TOAST_ROOT).count()).toBe(0);
  });

  test(`${viewport.name}: a server refusal names the file and the server's reason on the dropzone's line`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const uploads = await recordUploads(page, { kind: "refused", status: UNSUPPORTED_MEDIA_TYPE, reason: SPOOF_REASON });
    const trpc = await routeTrpc(page, { "assets.listGallery": () => [], "assets.addToGallery": () => UPLOADED_ITEM });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);

    await expect(zone.locator(DROPZONE_ERROR)).toContainText(`Couldn't upload sunset.png: ${SPOOF_REASON}.`);
    await expect.poll(() => uploads.length).toBe(1);
    await expect.poll(() => trpc.count("assets.addToGallery")).toBe(0);
  });

  test(`${viewport.name}: a refused long file name wraps inside the zone instead of widening the dialog`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    await recordUploads(page, { kind: "refused", status: UNSUPPORTED_MEDIA_TYPE, reason: SPOOF_REASON });
    await routeTrpc(page, { "assets.listGallery": () => [] });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [{ ...SMALL_PNG, name: LONG_NAME }]);

    await expect(zone.locator(DROPZONE_ERROR)).toContainText(LONG_NAME);
    const overflow =
      (selector: string): (() => Promise<number>) =>
      (): Promise<number> =>
        page
          .locator(selector)
          .first()
          .evaluate((el) => el.scrollWidth - el.clientWidth);
    await expect.poll(overflow(DROPZONE)).toBeLessThanOrEqual(0);
    await expect.poll(overflow('[data-slot="dialog-popup"]')).toBeLessThanOrEqual(0);
  });

  test(`${viewport.name}: a keyboard upload keeps focus on the zone while it runs, and the zone counts the files`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    const held = await holdUploads(page);
    let added = false;
    await routeTrpc(page, {
      "assets.listGallery": galleryAfterAdd(() => added),
      "assets.addToGallery": () => {
        added = true;
        return UPLOADED_ITEM;
      },
    });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    const input = zone.locator('input[type="file"]');
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    // The dialog places its own initial focus a frame after it opens; take focus only once that has landed.
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-slot"))).toBe("dialog-popup");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await input.focus();
    await expect(input).toBeFocused();
    await input.setInputFiles([SMALL_PNG, SECOND_PNG].map((file) => ({ name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.content) })));

    await expect.poll(held.count).toBe(1);
    await expect(zone).toContainText("Uploading 1 of 2");
    await expect(input).toBeFocused();

    held.release();
    await expect(zone).toHaveAttribute("data-success", "");
    await expect(input).toBeFocused();
    await expect(zone).not.toContainText("Uploading");
  });

  test(`${viewport.name}: a batch the dropzone refuses outright clears the last batch's success mark`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    await recordUploads(page);
    let added = false;
    await routeTrpc(page, {
      "assets.listGallery": galleryAfterAdd(() => added),
      "assets.addToGallery": () => {
        added = true;
        return UPLOADED_ITEM;
      },
    });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);
    await expect(zone).toHaveAttribute("data-success", "");

    await dropFiles(zone, [NOT_AN_IMAGE]);
    await expect(zone.locator(DROPZONE_ERROR)).toContainText("notes.txt isn't an accepted file type");
    await expect(zone).not.toHaveAttribute("data-success", "");
  });

  test(`${viewport.name}: a batch the dropzone refuses outright clears the last batch's server refusal`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await capImageUploads(page);
    await recordUploads(page, { kind: "refused", status: UNSUPPORTED_MEDIA_TYPE, reason: SPOOF_REASON });
    await routeTrpc(page, { "assets.listGallery": () => [] });
    await mount(<CharacterGalleryDialogStory />);

    const zone = page.locator(DROPZONE);
    await expect(zone.getByText(CAP_HINT)).toBeVisible();
    await dropFiles(zone, [SMALL_PNG]);
    await expect(zone.locator(DROPZONE_ERROR)).toContainText("Couldn't upload sunset.png");

    await dropFiles(zone, [NOT_AN_IMAGE]);
    await expect(zone.locator(DROPZONE_ERROR)).toContainText("notes.txt isn't an accepted file type");
    await expect(zone.locator(DROPZONE_ERROR)).not.toContainText("sunset.png");
  });
}
