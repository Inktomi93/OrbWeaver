// CT: the sticky DialogFooter under modal glass. A backdrop-filter on the popup itself makes it a backdrop root,
// which blinds the footer's nested blur to the body scrolling beneath it; the glass lives on `::before` instead.

import { Dialog, DialogFooter, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { expect, test } from "@playwright/experimental-ct-react";

test("under modal glass the popup is no backdrop root and the footer stacks no second fill", async ({ mount, page }) => {
  await page.evaluate(() => document.documentElement.setAttribute("data-blur-modals", ""));
  await mount(
    <Dialog defaultOpen={true}>
      <DialogPopup>
        <DialogTitle>Glass footer</DialogTitle>
        <div style={{ overflowY: "auto", maxHeight: 200 }}>
          <div style={{ height: 2000 }}>a long body</div>
          <DialogFooter>
            <button type="button">Cancel</button>
          </DialogFooter>
        </div>
      </DialogPopup>
    </Dialog>,
  );
  await expect(page.locator('[data-slot="dialog-footer"]')).toBeVisible();

  const read = (): Promise<Record<string, boolean>> =>
    page.evaluate(() => {
      const popupEl = document.querySelector('[data-slot="dialog-popup"]');
      const footerEl = document.querySelector('[data-slot="dialog-footer"]');
      if (popupEl === null || footerEl === null) {
        throw new Error("dialog not mounted");
      }
      const popupStyle = getComputedStyle(popupEl);
      const footerStyle = getComputedStyle(footerEl);
      const clear = "rgba(0, 0, 0, 0)";
      return {
        popupIsNoBackdropRoot: popupStyle.backdropFilter === "none",
        popupPaintsNoFill: popupStyle.backgroundColor === clear,
        glassLayerBlurs: getComputedStyle(popupEl, "::before").backdropFilter !== "none",
        footerBlurs: footerStyle.backdropFilter !== "none",
        footerPaintsNoFill: footerStyle.backgroundColor === clear,
      };
    });

  await expect.poll(read).toEqual({ popupIsNoBackdropRoot: true, popupPaintsNoFill: true, glassLayerBlurs: true, footerBlurs: true, footerPaintsNoFill: true });
});
