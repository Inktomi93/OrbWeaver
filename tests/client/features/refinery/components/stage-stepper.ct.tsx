// CT: the stage stepper's RUNNING affordance and its reduced-motion opt-out. The polish lane added an
// indeterminate hairline (a travelling ::after on a clipped track) whose whole contract under
// `prefers-reduced-motion` is that the SEGMENT IS REMOVED, not parked — a frozen bar at one end reads as
// a stalled determinate progress bar, which is a worse lie than no affordance at all.
//
// `::after` is paint with no element, so this asserts through `getComputedStyle(el, "::after")` — the
// rendered result, not the class list (a class that stops applying is exactly the failure mode a
// className assertion cannot see).

import type { StageCell } from "@orb/client/features/refinery";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { StageStepperStory } from "../_ct-stories.tsx";

const RUNNING_CELLS: readonly StageCell[] = [
  { stage: "score", status: "overall 6.8 · full", done: true, running: false },
  { stage: "rewrite", status: "not run yet", done: false, running: true },
  { stage: "analyze", status: "needs a rewrite first", done: false, running: false },
];

/** A phone CONTENT width: three rich cells cannot sit side by side here, so the old horizontal row pushed
 *  Analyze off the pane's edge. */
const NARROW_STEPPER_PX = 360;
/** Sub-pixel slack for a fractional layout box — never a real overflow budget. */
const SUBPIXEL = 0.5;

function hairlineAfterContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="refinery-step-hairline"]');
    return el === null ? "MISSING" : getComputedStyle(el, "::after").content;
  });
}

test("the RUNNING cell carries the hairline and says so in WORDS; the ornament is hidden from assistive tech", async ({ mount, page }) => {
  await mount(<StageStepperStory active="rewrite" cells={RUNNING_CELLS} />);

  const hairline = page.getByTestId("refinery-step-hairline");
  await expect(hairline).toHaveCount(1);
  await expect(hairline).toHaveAttribute("aria-hidden", "true");
  // The state's only accessible carrier is the status line — announced once, in words.
  await expect(page.getByText("running…")).toBeVisible();
  // The travelling segment EXISTS here (the positive control the reduced-motion arm needs).
  expect(await hairlineAfterContent(page)).not.toBe("none");

  // The active cell is TINTED, not filled, and marks itself as the current step (P1-1/P1-11).
  const active = page.locator('[data-testid="refinery-step"][data-active="true"]');
  await expect(active).toHaveAttribute("aria-current", "step");
  await expect(active).toHaveAttribute("data-stage", "rewrite");
});

test("REDUCED MOTION removes the hairline's travelling segment outright, rather than freezing it", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<StageStepperStory active="rewrite" cells={RUNNING_CELLS} />);

  await expect(page.getByTestId("refinery-step-hairline")).toHaveCount(1);
  expect(await hairlineAfterContent(page)).toBe("none");
});

test("in a narrow container every cell stays inside the pane — the stepper stacks instead of clipping Analyze (P2)", async ({ mount, page }) => {
  // Mounted in a fixed-width `@container` frame: the stepper reflows to one column below the `@lg` step, so
  // all three cells keep their full status line at the phone width instead of the third falling off the edge
  // (the old horizontal `flex-1` row overflowed here). Asserts each cell's BOX against the frame's box —
  // a non-wrapping flex row does not scroll, its overflowing cells simply paint outside it.
  await mount(<StageStepperStory active="score" cells={RUNNING_CELLS} width={NARROW_STEPPER_PX} />);
  const frame = await page.locator('[data-testid="stepper-frame"]').boundingBox();
  expect(frame).not.toBeNull();
  const cells = page.locator('[data-testid="refinery-step"]');
  await expect(cells).toHaveCount(3);
  const boxes = await Promise.all(Array.from({ length: await cells.count() }, (_, i) => cells.nth(i).boundingBox()));
  boxes.forEach((box, i) => {
    expect(box, `cell ${i} has a box`).not.toBeNull();
    expect(box?.x ?? 0, `cell ${i} left edge inside the pane`).toBeGreaterThanOrEqual((frame?.x ?? 0) - SUBPIXEL);
    expect((box?.x ?? 0) + (box?.width ?? 0), `cell ${i} right edge inside the pane`).toBeLessThanOrEqual((frame?.x ?? 0) + (frame?.width ?? 0) + SUBPIXEL);
  });
});

test("no cell is running ⇒ no hairline at all — the affordance is a state, not decoration", async ({ mount, page }) => {
  await mount(
    <StageStepperStory
      active="score"
      cells={[
        { stage: "score", status: "overall 6.8 · full", done: true, running: false },
        { stage: "rewrite", status: "not run yet", done: false, running: false },
        { stage: "analyze", status: "needs a rewrite first", done: false, running: false },
      ]}
    />,
  );
  await expect(page.getByTestId("refinery-step-hairline")).toHaveCount(0);
});
