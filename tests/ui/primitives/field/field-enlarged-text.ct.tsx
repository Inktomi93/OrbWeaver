// @subject packages/ui/src/primitives/field/variants.ts
// A horizontal Field at a phone's enlarged text never outgrows the popup that holds it.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { PopoverFieldStory } from "./field-enlarged-text-stories.tsx";

const STORIES = "tests/ui/primitives/field/field-enlarged-text-stories";
const FONT_SCALE_PROPERTY = channelName("fontScale");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

// Runs in the page. Layout sizes, not painted boxes: the popup scales in as it opens, and a transform would skew a painted width.
function popupOvershoot(popup: HTMLElement): { readonly sideways: number; readonly columnPastInner: number } {
  const style = getComputedStyle(popup);
  const inner = popup.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  const column = popup.querySelector<HTMLElement>('[data-slot="field-control-col"]');
  if (column === null) {
    throw new Error("The popup holds no control column");
  }
  return { sideways: popup.scrollWidth - popup.clientWidth, columnPastInner: column.offsetWidth - inner };
}

for (const factor of [2, 3] as const) {
  test(`a horizontal Field's control column stays inside its popup at ${factor * 100}% text`, async ({ mount, page }) => {
    await mount<typeof PopoverFieldStory>(`${STORIES}/PopoverFieldStory`, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
    await page.getByRole("button", { name: "Pick color", exact: true }).click();
    const popup = page.locator('[data-slot="popover-popup"]');
    await expect(popup.getByRole("textbox", { name: "Rim shade", exact: true })).toBeVisible();
    await expect.poll(async () => (await popup.evaluate(popupOvershoot)).sideways).toBeLessThanOrEqual(SUBPIXEL);
    await expect.poll(async () => (await popup.evaluate(popupOvershoot)).columnPastInner).toBeLessThanOrEqual(SUBPIXEL);
  });
}
