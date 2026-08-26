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
import { HomeTileFirstBootStory, HomeTileReserveStory } from "../_ct-stories.tsx";
import { FIRST_BOOT_SKELETON_ROWS, RESERVED_TILE_PX } from "../_reserve-box.ts";

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

// …and the box has to be FILLED (side-eye R-1). Reserving 420px and painting a 160px 3-row skeleton inside
// it trades a layout shift for dead space: measured live, the recents tile showed 189px of blank under
// three lonely bars — the exact number the reservation had stopped shifting — while the temp-chat tile
// reserved 110.89px against the same skeleton and had its third bar clipped to a 2.9px hairline by
// `overflow: clip`. Both are asserted here in ROW units read off the rendered bars, never a hardcoded
// pitch: `--spacing-control-lg` is pointer-conditional (40px fine / 56px coarse), so a literal would pass
// on this runner and lie about a tablet.
test("the skeleton FILLS the reserved box — no blank tail, no hairline stub", async ({ mount }) => {
  const home = await mount(<HomeTileReserveStory />);
  const reserved = home.locator('[data-home-tile="slow"] [data-tile-reserved]');
  await expect(reserved.locator('[data-slot="skeleton"]').first()).toBeVisible();

  const geometry = await reserved.evaluate((box) => {
    const bars = [...box.querySelectorAll('[data-slot="skeleton"]')];
    const boxRect = box.getBoundingClientRect();
    const first = bars[0]?.getBoundingClientRect();
    const last = bars.at(-1)?.getBoundingClientRect();
    return {
      rowHeight: first?.height ?? 0,
      // How much of the box is left unpainted below the last bar…
      tail: boxRect.bottom - (last?.bottom ?? boxRect.bottom),
      // …and how much of that last bar actually survives the clip.
      lastVisible: Math.min(last?.bottom ?? 0, boxRect.bottom) - (last?.top ?? 0),
    };
  });

  await expect
    .poll(
      async () =>
        (
          await reserved.evaluate((box) => {
            const bars = [...box.querySelectorAll('[data-slot="skeleton"]')];
            const boxRect = box.getBoundingClientRect();
            const first = bars[0]?.getBoundingClientRect();
            const last = bars.at(-1)?.getBoundingClientRect();
            return {
              rowHeight: first?.height ?? 0,
              // How much of the box is left unpainted below the last bar…
              tail: boxRect.bottom - (last?.bottom ?? boxRect.bottom),
              // …and how much of that last bar actually survives the clip.
              lastVisible: Math.min(last?.bottom ?? 0, boxRect.bottom) - (last?.top ?? 0),
            };
          })
        ).rowHeight,
    )
    .toBeGreaterThan(0);
  // The 189px-of-blank defect: the unpainted tail may not exceed a single row's worth of space.
  await expect
    .poll(
      async () =>
        (
          await reserved.evaluate((box) => {
            const bars = [...box.querySelectorAll('[data-slot="skeleton"]')];
            const boxRect = box.getBoundingClientRect();
            const first = bars[0]?.getBoundingClientRect();
            const last = bars.at(-1)?.getBoundingClientRect();
            return {
              rowHeight: first?.height ?? 0,
              // How much of the box is left unpainted below the last bar…
              tail: boxRect.bottom - (last?.bottom ?? boxRect.bottom),
              // …and how much of that last bar actually survives the clip.
              lastVisible: Math.min(last?.bottom ?? 0, boxRect.bottom) - (last?.top ?? 0),
            };
          })
        ).tail,
    )
    .toBeLessThan(geometry.rowHeight);
  // The 2.9px-hairline defect: a bar that renders at all renders as a bar, not a sliver.
  await expect
    .poll(
      async () =>
        (
          await reserved.evaluate((box) => {
            const bars = [...box.querySelectorAll('[data-slot="skeleton"]')];
            const boxRect = box.getBoundingClientRect();
            const first = bars[0]?.getBoundingClientRect();
            const last = bars.at(-1)?.getBoundingClientRect();
            return {
              rowHeight: first?.height ?? 0,
              // How much of the box is left unpainted below the last bar…
              tail: boxRect.bottom - (last?.bottom ?? boxRect.bottom),
              // …and how much of that last bar actually survives the clip.
              lastVisible: Math.min(last?.bottom ?? 0, boxRect.bottom) - (last?.top ?? 0),
            };
          })
        ).lastVisible,
    )
    .toBeGreaterThan(geometry.rowHeight / 2);
});

// ── The FIRST-EVER-BOOT arm (#92, measured 2026-08-16) ──────────────────────────────────────────────
// Everything above is the SECOND boot: a box this device already measured. The first boot reserved
// NOTHING, and that was the whole defect left on the tree — a fresh profile (a new device, cleared
// storage, and every Playwright profile, which is why the harness kept catching it) painted the frame's
// 3-row skeleton under every tile, so when the reads landed `chat.recents` grew 233px → 541px and pushed
// the two tiles under it down 308px: home alone scored CLS 0.1338 against a 0.1 budget in 3/3 live runs.
// The same drive with the box memory pre-seeded scored 0.0002 — the mechanism was fine, its first-boot
// arm was empty. A tile now DECLARES the row count its own read renders (`skeletonRows`), so boot one
// reserves the same geometry boot two remembers.
//
// STANDING: this is a FENCE, not the defect proof. The defect was proved at the tier it was reported —
// `__orb.motion()` over the live drive — because a CT cannot mount a first boot of the REAL tiles
// without their reads. It guards the frame's half: a declaration that stops reaching the fallback.
test("a FIRST-boot tile reserves the rows it DECLARES — the tile below it does not move", async ({ mount, page }) => {
  const home = await mount(<HomeTileFirstBootStory />);
  const declared = home.locator('[data-home-tile="declared"]');
  const under = home.locator('[data-home-tile="under"]');

  // No remembered box for this id, so there is no `[data-tile-reserved]` wrapper — the DECLARED row count
  // is the only thing holding the box open, and it is read off the rendered bars, never a hardcoded pitch.
  await expect(declared.locator("[aria-busy]")).toBeVisible();
  await expect(declared.locator("[data-tile-reserved]")).toHaveCount(0);
  await expect(declared.locator('[data-slot="skeleton"]')).toHaveCount(FIRST_BOOT_SKELETON_ROWS);

  await expect(under).toBeVisible();
  const beforeTop = (await under.boundingBox())?.y ?? 0;

  await page.getByRole("button", { name: "Settle" }).click();
  // The settled body is the same skeleton geometry at the same count, so a correct reservation moves
  // nothing. Under the old 3-row default this lands five rows lower.
  await expect
    .poll(
      async () => {
        const afterTop = (await under.boundingBox())?.y ?? 0;
        return Math.abs(afterTop - beforeTop) <= PX_EPSILON;
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
