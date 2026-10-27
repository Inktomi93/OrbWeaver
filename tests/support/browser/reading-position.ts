import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const PIN_SCROLL_PX = 400;

/** A colour token as `box`'s own scope paints it, read off a probe beside it, so a carried palette resolves alike. */
export function tokenColor(box: Locator, token: string, property: "background-color" | "color"): Promise<string> {
  return box.evaluate(
    (element, [name, prop]) => {
      const probe = element.ownerDocument.createElement("div");
      probe.style.setProperty(prop, `var(${name})`);
      element.parentElement?.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [token, property] as const,
  );
}

/** Scrolls into the real message, then barriers on its observed pin state. */
export async function scrollIntoReadingMessage(row: Locator, sticky = true): Promise<void> {
  await row.evaluate((element, by) => {
    const scroller = element.closest('[data-slot="message-list-scroll"]');
    if (scroller === null) {
      throw new Error("The message has no transcript scrollport");
    }
    scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + by;
  }, PIN_SCROLL_PX);
  await expect.poll(() => row.locator('[data-slot="message-name-row"]').getAttribute("data-pinned")).toBe(sticky ? "" : null);
}

/** Native scroll input gives the reader the axis before the targeted reading-position drive. */
export async function beginReading(page: Page, scrollport: Locator): Promise<void> {
  const before = await scrollport.evaluate((element) => element.scrollTop);
  await scrollport.hover();
  await page.mouse.wheel(0, -PIN_SCROLL_PX);
  await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeLessThan(before);
}
