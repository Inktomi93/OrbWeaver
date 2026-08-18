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

interface HairlineGeometry {
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly segmentWidth: number;
  readonly segmentHeight: number;
}

/** The travelling segment's RESOLVED box beside its host's. `::after` is paint with no element, so its
 *  used width/height come off `getComputedStyle(el, "::after")` — which resolves the `33%` and the
 *  `inset-block: 0` against whatever containing block the segment actually landed in. That is the whole
 *  point: a percentage and an inset only mean "inside the track" when the TRACK is the containing block. */
function hairlineGeometry(page: Page): Promise<HairlineGeometry> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="refinery-lane-hairline"]');
    if (el === null) {
      throw new Error("the hairline host is missing");
    }
    const host = el.getBoundingClientRect();
    const after = getComputedStyle(el, "::after");
    return {
      hostWidth: host.width,
      hostHeight: host.height,
      segmentWidth: Number.parseFloat(after.width),
      segmentHeight: Number.parseFloat(after.height),
    };
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

test("the travelling segment is CONTAINED by the 1px track it rides — never a pane-sized block over the workbench (#143)", async ({ mount, page }) => {
  await mount(<LaneRunControlStory running={true} stage="rewrite" width={RAIL_PX} />);

  const geometry = await hairlineGeometry(page);
  // The positive control: the segment exists and has a real box (a zero here would make the two
  // containment assertions below pass vacuously).
  expect(geometry.segmentWidth, "the travelling segment has a rendered width").toBeGreaterThan(0);
  expect(geometry.hostHeight, "the track itself is a hairline").toBeLessThanOrEqual(1 + SUBPIXEL);
  // CONTAINMENT — the defect, stated as geometry: with no positioned host the absolutely-positioned
  // segment resolves `inset-block: 0` and `33%` against the pane's scroll container instead, and paints a
  // full-height opaque `--color-primary` block over a third of the workbench for the whole run.
  expect(geometry.segmentHeight, "the segment is no taller than its track").toBeLessThanOrEqual(geometry.hostHeight + SUBPIXEL);
  expect(geometry.segmentWidth, "the segment is no wider than its track").toBeLessThanOrEqual(geometry.hostWidth + SUBPIXEL);
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

// ── THE LANE HEADER'S OWN HIERARCHY (side-eye 2026-08-17, finding e) ─────────────────────────────────
// The band's kicker NAMES the lane; the fit readout is the advisory under it. It was set at `datum` (13px
// mono foreground) on a forced full-width line, so it outranked the name above it and pushed the verb onto
// a third row — ~100px of chrome before content, in all three lanes, whatever the width.

test("where the lane is WIDE the readout and the verb share one line — the wrap is a fallback, not the resting shape", async ({ mount, page }) => {
  // The fluid rewrite lane, not a rail: at this width there is room for both, and the old `basis-full`
  // spent a whole row anyway.
  await mount(<LaneRunControlStory running={false} stage="rewrite" width={640} />);
  const fit = await rectOf(page.getByTestId("refinery-fit-line"));
  const verb = await rectOf(page.getByRole("button", { name: "Re-run rewrite" }));
  // SAME LINE = their vertical extents overlap (they are different heights, so this is the honest test).
  expect(fit.y, "the readout sits on the verb's line").toBeLessThan(verb.y + verb.height);
  expect(verb.y).toBeLessThan(fit.y + fit.height);
  expect(intersects(fit, verb), "sharing a line is not overlapping").toBe(false);
});

test("the readout is set one register BELOW the lane's own name — the advisory never outranks the heading it sits under", async ({ mount, page }) => {
  await mount(<LaneRunControlStory running={false} stage="score" width={RAIL_PX} />);
  const type = await page.evaluate(() => {
    const fit = document.querySelector('[data-testid="refinery-fit-line"]');
    if (fit === null) {
      throw new Error("the fit line is missing");
    }
    const probe = document.createElement("div");
    document.body.append(probe);
    // The KICKER's step, resolved from the stylesheet — the band that names the lane is set at it, and the
    // readout under it may not be larger. Never a hardcoded px.
    probe.style.fontSize = getComputedStyle(document.documentElement).getPropertyValue("--text-micro");
    const kickerStep = getComputedStyle(probe).fontSize;
    probe.remove();
    return { fitStep: getComputedStyle(fit).fontSize, kickerStep };
  });
  expect(type.fitStep, "the readout is at the quiet step, not the datum step").toBe(type.kickerStep);
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
