import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** An opening, clipped panel can scroll a stable child into view, then move it before mouse-up. */
export async function expectDisclosureReady(trigger: Locator): Promise<void> {
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(
      () =>
        trigger.evaluate((element) => {
          const panelId = element.getAttribute("aria-controls");
          const panel = panelId === null ? null : element.ownerDocument.getElementById(panelId);
          return panel === null
            ? null
            : {
                animations: panel.getAnimations().length,
                clipped: panel.scrollHeight > panel.clientHeight,
                scrolled: panel.scrollTop !== 0,
              };
        }),
      { intervals: [20, 50, 100] },
    )
    .toEqual({ animations: 0, clipped: false, scrolled: false });
}
