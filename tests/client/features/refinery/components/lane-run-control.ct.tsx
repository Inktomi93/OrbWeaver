// CT: one lane's run control — the RUNNING affordance and the rail geometry.
//
// The reduced-motion pair below is MIGRATED VERBATIM IN INTENT from the deleted stage stepper's CT
// (tests/client/features/refinery/components/stage-stepper.ct.tsx, removed with the stepper when the
// workbench put all three stages on one canvas). The affordance did not go with it — the indeterminate
// hairline moved into the lane band — and its contract is unchanged: under `prefers-reduced-motion` the
// travelling segment is REMOVED, not parked, because a frozen bar at one end reads as a stalled
// determinate progress bar, which is a worse lie than no affordance at all.
//
// `::after` is paint with no element, so this asserts through `getComputedStyle(el, "::after")` — the
// rendered result, never the class list (a class that stops applying is exactly the failure mode a
// className assertion cannot see).
//
// The geometry test is the rail-width half of the old run-bar overlap proof (side-eye 2026-08-09 P1): the
// fit-line readout and the stage's verb now share a 15–17rem rail rather than a full-width bar, which is
// strictly tighter than the width that produced the original overlap — so it is measured HERE, as pixels,
// not as classes.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { LaneRunControlStory } from "../_ct-stories.tsx";

/** The narrowest real rail: the score lane is `w-60` (15rem / 240px) at the three-lane arm. */
const RAIL_PX = 240;
/** Sub-pixel slack for a fractional layout box — never a real overflow budget. */
const SUBPIXEL = 0.5;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function rectOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("element has no bounding box");
  }
  return box;
}

/** Do two rendered rectangles share any pixels? */
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function hairlineAfterContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="refinery-lane-hairline"]');
    return el === null ? "MISSING" : getComputedStyle(el, "::after").content;
  });
}

test("a RUNNING lane carries the indeterminate hairline; the ornament is hidden from assistive tech and the verb says busy", async ({ mount, page }) => {
  await mount(<LaneRunControlStory running={true} stage="rewrite" width={RAIL_PX} />);

  const hairline = page.getByTestId("refinery-lane-hairline");
  await expect(hairline).toHaveCount(1);
  await expect(hairline).toHaveAttribute("aria-hidden", "true");
  // The state's accessible carrier is the verb, announced once — the hairline is pure ornament.
  await expect(page.getByRole("button", { name: "Re-run rewrite" })).toHaveAttribute("aria-busy", "true");
  // The travelling segment EXISTS here (the positive control the reduced-motion arm needs).
  expect(await hairlineAfterContent(page)).not.toBe("none");
});

test("REDUCED MOTION removes the hairline's travelling segment outright, rather than freezing it", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<LaneRunControlStory running={true} stage="rewrite" width={RAIL_PX} />);

  await expect(page.getByTestId("refinery-lane-hairline")).toHaveCount(1);
  expect(await hairlineAfterContent(page)).toBe("none");
});

test("no call in flight ⇒ no hairline at all — the affordance is a state, not decoration", async ({ mount, page }) => {
  await mount(<LaneRunControlStory running={false} stage="score" width={RAIL_PX} />);
  await expect(page.getByTestId("refinery-lane-hairline")).toHaveCount(0);
});

test("at a RAIL width the fit-line readout overlaps no verb and nothing paints outside the rail", async ({ mount, page }) => {
  await mount(<LaneRunControlStory running={false} stage="analyze" width={RAIL_PX} />);

  const fit = page.getByTestId("refinery-fit-line");
  const verb = page.getByRole("button", { name: "Re-run analyze" });
  await expect(fit).toBeVisible();
  await expect(verb).toBeVisible();

  const frame = await rectOf(page.getByTestId("lane-run-frame"));
  const fitRect = await rectOf(fit);
  const verbRect = await rectOf(verb);
  expect(intersects(fitRect, verbRect), "the fit-line must not overlap the run verb").toBe(false);
  // …and both stay inside the rail: a non-wrapping row does not scroll, it simply paints outside its box.
  for (const [name, rect] of [
    ["fit-line", fitRect],
    ["run verb", verbRect],
  ] as const) {
    expect(rect.x, `${name} left edge inside the rail`).toBeGreaterThanOrEqual(frame.x - SUBPIXEL);
    expect(rect.x + rect.width, `${name} right edge inside the rail`).toBeLessThanOrEqual(frame.x + frame.width + SUBPIXEL);
  }
});
