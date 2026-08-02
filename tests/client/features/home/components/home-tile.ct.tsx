// HomeTile FRAME CT — the boot-CLS reservation (F14, measured 2026-08-02). Home was the app's layout-shift
// site: every tile suspends behind its own QueryBoundary (§3.7) onto a fixed 3-row skeleton, so when the
// reads landed the full-span "Recent chats" tile grew out of that skeleton and pushed every tile below it
// DOWN the grid (+189px; boot CLS 0.0913 at 1440x900 on a 6-chat dev DB, 0.24 on a fuller one).
//
// The frame now reserves the height THIS DEVICE measured the tile settling at last time. These pin the two
// halves as RENDERED GEOMETRY, not source: (1) the loading box IS the remembered height, and (2) the tile
// below does not move when the read lands — the actual defect. The store's own guards (what is allowed to
// be remembered) are the unit test's job; this is the pixels.

import { expect, test } from "@playwright/experimental-ct-react";
import { HomeTileReserveStory } from "../_ct-stories";
import { RESERVED_TILE_PX } from "../_reserve-box";

/** Tolerance for a boundingBox against a reserved min-block-size — sub-pixel layout rounding only. */
const PX_EPSILON = 1;

test("a still-reading tile occupies the box it settled at last boot — not a 3-row skeleton's", async ({ mount }) => {
  const home = await mount(<HomeTileReserveStory />);
  const slow = home.locator('[data-home-tile="slow"]');

  // The skeleton is up (the body is still suspended)…
  await expect(slow.locator("[aria-busy]")).toBeVisible();
  // …inside the REMEMBERED box, which is what the tile's height is made of while it reads.
  await expect
    .poll(
      async () => {
        const box = await slow.locator("[data-tile-reserved]").boundingBox();
        return Math.abs((box?.height ?? 0) - RESERVED_TILE_PX) <= PX_EPSILON;
      },
      { intervals: [20, 50, 100] },
    )
    .toBe(true);
});

test("the tile BELOW does not move when the read lands — the +189px push is gone", async ({ mount, page }) => {
  const home = await mount(<HomeTileReserveStory />);
  const slow = home.locator('[data-home-tile="slow"]');
  const below = home.locator('[data-home-tile="below"]');

  await expect(slow.locator("[aria-busy]")).toBeVisible();
  await expect(below).toBeVisible();
  const beforeTop = (await below.boundingBox())?.y ?? 0;

  // Release the suspended body: the tile's content replaces the skeleton in the SAME box.
  await page.getByRole("button", { name: "Settle" }).click();
  await expect(home.getByText("settled slow body")).toBeVisible();

  // The mover the trace named. A regression (an unreserved skeleton) shifts this by the tile's growth.
  await expect
    .poll(
      async () => {
        const afterTop = (await below.boundingBox())?.y ?? 0;
        return Math.abs(afterTop - beforeTop) <= PX_EPSILON;
      },
      { intervals: [20, 50, 100] },
    )
    .toBe(true);
});
