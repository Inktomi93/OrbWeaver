// CT: `ConditionChips`' remove ✕ — the TOUCH FLOOR at a real coarse pointer.
//
// THE DEFECT (side-eye 2026-08-07 §②; owner ruled the fix the same day). The ✕ is `size="glyph-xs"` — a
// FLOORLESS arm, whose ≥44px coarse hit area rides an OVERFLOWING `::after` rather than its 16px box. Inside
// a `flex-wrap` chip run the pseudo is clipped by the gap it shares with the row below, so the floor is never
// actually delivered: MEASURED at 430 coarse with five live conditions, chip 30 tall, gap 6 ⇒ wrapped-row
// pitch 36, effective ✕ target **43×35** — 9px under the vertical floor, on a DESTRUCTIVE verb, on every
// wrapped row. (The `no-floorless-control-in-wrap` gate's stated harm — committing a NEIGHBOUR — was measured
// FALSE here: a cross-chip sample lands in the 6px gap. The arm was right; its reason was not.)
//
// THE FIX flooring the CHIP (`pointer-coarse:min-h-touch-target`) is the only priced option that fixes the
// CAUSE — a 44px hit area hanging off a 30px chip — so the pseudo fits inside its own chip and the visible
// chip and the live destructive zone become one shape.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium (`page.emulateMedia` has no
// `pointer` feature); the first assertion PROVES the emulation landed before any geometry is trusted.

import { expect, test } from "@playwright/experimental-ct-react";
import { hitBoxes, touchFloorPx } from "../../../../support/ct/touch-floor.ts";
import { ConditionChipsStory } from "../_ct-stories.tsx";

const REMOVE_BUTTON = /^Remove /;

test.describe("coarse touch floor", () => {
  test.use({ hasTouch: true });

  test("every remove ✕ clears the touch floor on BOTH axes, including wrapped rows", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<ConditionChipsStory />);

    const removes = component.getByRole("button", { name: REMOVE_BUTTON });
    await expect(removes).toHaveCount(5);
    // The fixture must actually WRAP — a single row's last ✕ clears the floor by accident of having nothing
    // beside it, which is precisely how a one-row probe would miss this defect.
    await expect
      .poll(() =>
        component.evaluate((el: HTMLElement) => {
          const tops = Array.from(el.querySelectorAll<HTMLElement>('[data-slot="badge"]')).map((node) => Math.round(node.getBoundingClientRect().top));
          return new Set(tops).size;
        }),
      )
      .toBeGreaterThan(1);

    const floor = await touchFloorPx(page);
    const measured = await hitBoxes(removes, await removes.count());
    expect(measured.filter((m) => m.x < floor || m.y < floor)).toEqual([]);
  });
});
