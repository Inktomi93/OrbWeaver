// Page drivers for a custom property written on `:root`, the way an appearance channel reaches the document.

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Write `property` on `:root` through one `!important` rule per property, or clear that rule with `null`. */
export async function setRootProperty(page: Page, property: string, value: number | null): Promise<void> {
  await page.evaluate(
    ([name, written]) => {
      const id = `root-property${name}`;
      if (written === null) {
        document.getElementById(id)?.remove();
        return;
      }
      const style = document.getElementById(id) ?? document.head.appendChild(document.createElement("style"));
      style.id = id;
      style.textContent = `:root { ${name}: ${written} !important; }`;
    },
    [property, value === null ? null : String(value)] as const,
  );
}

/** Step `property` up `ladder`, one rung per poll, until `trigger` shows: how much growth a band takes before it
 *  overflows depends on the engine's layout width, so the case does not guess it. */
export async function enlargeUntilVisible(page: Page, trigger: Locator, property: string, ladder: readonly number[]): Promise<void> {
  const last = ladder.length - 1;
  let step = 0;
  await expect
    .poll(async () => {
      await setRootProperty(page, property, ladder[Math.min(step, last)] ?? null);
      step += 1;
      return trigger.isVisible();
    })
    .toBe(true);
}
