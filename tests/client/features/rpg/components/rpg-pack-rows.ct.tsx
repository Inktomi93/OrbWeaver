// CT: `ItemIconPicker`'s icon grid — the TOUCH FLOOR at a real coarse pointer.
//
// THE DEFECT (side-eye 2026-08-07 §②; owner ruled the fix the same day). The cells are `size="glyph-lg"` — a
// FLOORLESS arm, whose ≥44px coarse hit area rides an OVERFLOWING `::after` rather than its 32px box. Mapped
// into a `flex-wrap` popover the pseudo is clipped by the gap it shares with the next cell, so the floor is
// never actually delivered: MEASURED at 430 coarse, box 32, `gap-field` 6 ⇒ pitch **38** both axes, effective
// target **37×37** — 7px under the floor, on nearly every one of 21 cells. (The
// `no-floorless-control-in-wrap` gate's stated harm — committing a NEIGHBOUR — was measured FALSE here: all
// 21 cells hit themselves, because the 6px of pseudo overlap lands entirely inside the gap.)
//
// THE FIX is the GAP: `pointer-coarse:gap-block` is 12px, which makes the pitch exactly 44 — the cause fixed
// with the token that already equals the answer, and the fine picker untouched.

import { expect, test } from "@playwright/experimental-ct-react";
import { hitBoxes, measurePitch, touchFloorPx } from "../../../../support/ct/touch-floor.ts";
import { PackIconPickerStory } from "../_ct-stories.tsx";

const ICON_CHOICE = /^Iron Sword: use the /;

test.describe("coarse touch floor", () => {
  test.use({ hasTouch: true });

  test("every icon cell clears the touch floor on BOTH axes", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<PackIconPickerStory />);

    // The picker is a popover — opened the way a host opens it, by tapping a row's glyph trigger.
    await component.getByRole("button", { name: "Iron Sword icon" }).click();
    const choices = page.getByRole("button", { name: ICON_CHOICE });
    await expect(choices.first()).toBeVisible();

    const count = await choices.count();
    expect(count).toBeGreaterThan(4);

    // THE PITCH IS THE EXACT CLAIM, and a hit sweep alone cannot state it: this is a TILED run, so at a 44px
    // pitch the abutting 44px targets share their boundary sample and the sweep reports 43 for BOTH — one px
    // short of the floor it is actually delivering. (side-eye measured the same 43×43 for this option and
    // called it the cleared floor.) So the floor is asserted on the pitch, which has no boundary to share,
    // and the sweep is then asserted against the pitch — which is what proves the pseudo is not CLIPPED below
    // it, the real defect (37 on a 38 pitch).
    //
    // POLLED, because the popover OPENS WITH A SCALE: a same-tick read caught it mid-transition at
    // `scale: 0.95` and reported a 41.8px pitch that does not exist once the animation settles.
    const floor = await touchFloorPx(page);
    await expect.poll(async () => (await measurePitch(choices)).x).toBeGreaterThanOrEqual(floor);
    await expect.poll(async () => (await measurePitch(choices)).y).toBeGreaterThanOrEqual(floor);

    const pitch = await measurePitch(choices);
    const measured = await hitBoxes(choices, count);
    expect(measured.filter((m) => m.x < pitch.x - 1 || m.y < pitch.y - 1)).toEqual([]);
  });
});
