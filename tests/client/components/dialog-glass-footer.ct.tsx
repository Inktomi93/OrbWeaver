// CT: the sticky DialogFooter under modal glass. A backdrop-filter on the popup itself makes it a backdrop root,
// which blinds the footer's nested blur to the body scrolling beneath it; the glass blur lives on `::before`.

import { AlertDialog, AlertDialogPopup, AlertDialogTitle } from "@orb/ui/alert-dialog";
import { expect, test } from "@playwright/experimental-ct-react";
import { StripedGlassDialogStory } from "./dialog-glass-footer.fixtures.tsx";

test("text scrolling under the glass footer is blurred away, not legible", async ({ mount, page }) => {
  await page.evaluate(() => document.documentElement.setAttribute("data-blur-modals", ""));
  await mount(<StripedGlassDialogStory />);
  const footer = page.locator('[data-slot="dialog-footer"]');
  await expect(footer).toBeVisible();
  const box = await footer.boundingBox();
  if (box === null) {
    throw new Error("footer has no box");
  }

  // One-pixel black/white stripes under the footer: crisp, adjacent framebuffer rows differ by about 255; blurred, they barely differ.
  const sharpestStep = async (fromY: number): Promise<number> => {
    const clip = { x: Math.floor(box.x) + 4, y: Math.floor(fromY), width: 24, height: 16 };
    const shot = await page.screenshot({ clip });
    const dataUrl = `data:image/png;base64,${shot.toString("base64")}`;
    return await page.evaluate(
      async ({ url, width, height }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
          throw new Error("no 2d context");
        }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, width, height).data;
        let sharpest = 0;
        for (let y = 0; y < height - 1; y += 1) {
          const here = data[(y * width + 4) * 4] ?? 0;
          const below = data[((y + 1) * width + 4) * 4] ?? 0;
          sharpest = Math.max(sharpest, Math.abs(here - below));
        }
        return sharpest;
      },
      { url: dataUrl, width: clip.width, height: clip.height },
    );
  };
  // Control: the same stripes above the footer are crisp, so the sampler can see a sharp edge at all.
  await expect.poll(() => sharpestStep(box.y - 40)).toBeGreaterThan(200);
  await expect.poll(() => sharpestStep(box.y + 2)).toBeLessThan(64);
});

test("the alert dialog's glass layer is bounded by its popup, never the viewport", async ({ mount, page }) => {
  await page.evaluate(() => document.documentElement.setAttribute("data-blur-modals", ""));
  await mount(
    <AlertDialog defaultOpen={true}>
      <AlertDialogPopup>
        <AlertDialogTitle>Sure?</AlertDialogTitle>
      </AlertDialogPopup>
    </AlertDialog>,
  );
  const popup = page.locator('[data-slot="alert-dialog-popup"]');
  await expect(popup).toBeVisible();
  // An absolutely positioned layer is bounded by its nearest positioned ancestor, so the popup must be one.
  await expect.poll(() => popup.evaluate((el) => getComputedStyle(el).position)).not.toBe("static");
});
