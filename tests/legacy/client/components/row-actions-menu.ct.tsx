// CT: `RowActionsMenu`'s TRIGGER is a tap target on every arm of `triggerSize` (#1613, D62 P1).
//
// WHY THIS FILE EXISTS. `triggerSize` used to be a passthrough of `Button`'s size axis, and its `"sm"`
// arm named a TEXT step: `h-control-sm px-block text-label` — a pointer-conditional HEIGHT (44 coarse /
// 32 fine) with a content WIDTH of `px-block × 2 + a 16px glyph` = 40px at both pointers. So the theme
// Looks rows' ⋯ measured 40×44 under a finger and design-audit's `tap-target` filed it P2 on
// `[aria-label="Theme actions: Hearth"]` / "Light" / "Mocha" — "3 affected of 3 judged; short side 40px"
// (settings:appearance --mobile, 2026-09-05). The two icon-only arms carried the floor by construction
// and the text arm did not, which is a property of the AXIS, so the pin is on the axis: every arm, both
// pointer classes, against the RESOLVED `--spacing-touch-target` rather than a literal 44.
//
// THE FLOOR IS READ FROM THE PAGE, NOT HARDCODED. `--spacing-touch-target` is the pointer-CONDITIONAL
// token (44px coarse / 28px fine, theme.css) — reading it out of the live root is the only way one
// assertion can be true at both pointers, and a retune of the token moves the test with it.
//
// THE BOX IS UNIONED WITH ITS PSEUDOS. The `inline` arm is a text-height datum whose tap floor is an
// absolutely-positioned `::after` (button/variants.ts), so a bounding-box-only read would fail a control
// that is in fact conformant — the same union the @orb/ui touch-target-floor suite performs, extended to
// `::after` because that is the pseudo this axis uses.

import { rowActionsName } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { RowActionsTriggerSizesStory } from "./row-actions-menu.fixtures.tsx";

const ARMS = ["icon", "sm", "inline"] as const;

/** The resolved pointer-conditional tap floor, in CSS px, from the live root. */
async function resolvedTouchFloorPx(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-touch-target)";
    document.body.append(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
  });
}

/** The effective hit box: the visible border box unioned per-axis with an absolutely-positioned
 *  `::before`/`::after` (the hit-area pseudo the sub-control size arms carry). */
async function shortSide(locator: Locator): Promise<number> {
  return await locator.evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;
    for (const pseudo of ["::before", "::after"]) {
      const style = getComputedStyle(el, pseudo);
      if (style.content === "none" || style.position !== "absolute") {
        continue;
      }
      const pw = Number.parseFloat(style.width);
      const ph = Number.parseFloat(style.height);
      if (Number.isFinite(pw)) {
        width = Math.max(width, pw);
      }
      if (Number.isFinite(ph)) {
        height = Math.max(height, ph);
      }
    }
    return Math.min(width, height);
  });
}

test.describe("under a coarse pointer", () => {
  // `hasTouch` is what flips `matchMedia("(pointer: coarse)")` in chromium — `page.emulateMedia` exposes
  // no `pointer` feature, so it cannot drive this (the touch-target-floor suite's R6 precedent).
  test.use({ hasTouch: true });

  test("the emulation actually landed — the coarse branch of the token map is the live one", async ({ mount, page }) => {
    await mount(<RowActionsTriggerSizesStory />);
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const fine = await page.evaluate(() => matchMedia("(pointer: fine)").matches);
    expect(coarse, "hasTouch must win the coarse @theme arm").toBe(true);
    expect(fine, "the fine override must NOT apply under a coarse pointer").toBe(false);
  });

  test("every triggerSize arm meets the resolved touch floor on its short side", async ({ mount, page }) => {
    const component = await mount(<RowActionsTriggerSizesStory />);
    await expect
      .poll(() => resolvedTouchFloorPx(page), { message: "the coarse arm of --spacing-touch-target must be the ≥44px one" })
      .toBeGreaterThanOrEqual(44);
    const floor = await resolvedTouchFloorPx(page);
    for (const arm of ARMS) {
      const trigger = component.getByRole("button", { name: rowActionsName(arm), exact: true });
      await expect.poll(() => shortSide(trigger), { intervals: [20, 50, 100], message: `triggerSize="${arm}"` }).toBeGreaterThanOrEqual(floor);
    }
  });
});

test.describe("under a fine pointer", () => {
  test("every arm still clears the resolved floor when the pointer is a mouse (the fine arm of the same token)", async ({ mount, page }) => {
    const component = await mount(<RowActionsTriggerSizesStory />);
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "the CT default context is a mouse").toBe(true);
    const floor = await resolvedTouchFloorPx(page);
    for (const arm of ARMS) {
      const trigger = component.getByRole("button", { name: rowActionsName(arm), exact: true });
      await expect.poll(() => shortSide(trigger), { intervals: [20, 50, 100], message: `triggerSize="${arm}"` }).toBeGreaterThanOrEqual(floor);
    }
  });
});
