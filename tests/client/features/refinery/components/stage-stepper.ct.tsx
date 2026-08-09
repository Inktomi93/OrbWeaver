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
