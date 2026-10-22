import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * UI-Density-Law 2.1: an avatar (and the click target that wraps one) takes the full radius. Reads the
 * computed corner against the measured box, so a class swap that paints a rounded square fails here.
 */
export async function expectCircle(target: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const { radius, width } = await target.evaluate((el) => ({
        radius: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius),
        width: el.getBoundingClientRect().width,
      }));
      return width > 0 && radius >= width / 2;
    })
    .toBe(true);
}
