// The child-rect sweep behind `snap --expect-no-overflow` (tooling/src/snap/ops/overflow.ts).
//
// A BROWSER IS THE ONLY TIER THAT CAN PROVE THIS. The sweep is layout arithmetic over
// `getBoundingClientRect` / `getComputedStyle` / `clientLeft` against a real clipping box; jsdom has no
// layout, so a node-tier test of it would assert a stub and pass on a broken instrument. The pure
// verdict half — which combination of scroll delta, swept axes and escapes reads FAIL — is node-tested
// beside this file (tests/tooling/snap/lib/overflow-line.test.ts).
//
// WHAT IS PINNED (#444, paid for by #439): a `nowrap justify-end` footer wider than its clipping
// container pushes its first control past the container's LEFT edge, where it is cut. That overflow is
// NEGATIVE, so `scrollWidth - clientWidth` — this assertion's only arm until now — reads 0, and the
// instrument printed `PASS overflow=0x0` over the defect (receipt: 2026-08-22). The healthy twin in the
// same story is the false-positive fence.
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { OverflowProbe } from "../../../../tooling/src/snap/contract/overflow.ts";
import { OVERFLOW_MAX_ESCAPES, OVERFLOW_TOLERANCE_PX, sweepOverflowEscapes } from "../../../../tooling/src/snap/ops/overflow.ts";
import { WalkerClippedInflowControlStory } from "../../_ct-stories.tsx";

/** Run the SHIPPED sweep body in the mounted page, over the element `--expect-no-overflow` would have
 *  matched. Not a re-typed copy of it: a proof of a paraphrase proves nothing about the tool. */
async function sweep(page: Page, selector: string): Promise<OverflowProbe> {
  return await page.locator(selector).evaluate(sweepOverflowEscapes, { tolerancePx: OVERFLOW_TOLERANCE_PX, maxEscapes: OVERFLOW_MAX_ESCAPES });
}

test("a control pushed past the LEFT edge of an overflow:auto box is an escape — the arm scrollWidth is blind to", async ({ mount, page }) => {
  await mount(<WalkerClippedInflowControlStory />);
  const probe = await sweep(page, "[data-testid=clip-dialog]");

  expect(probe.scrollX, "the scroll arm still reads ZERO here — this is exactly why the rect sweep exists").toBe(0);
  expect(probe.scrollY).toBe(0);
  // THE SECOND BLIND SPOT: this box is `overflow: auto`, like the live new-chat dialog. A per-AXIS
  // decline would skip it whole and re-ship the #439 blindness; left is judged because no negative
  // scroll offset exists, while right is declined because content there is reachable.
  expect(probe.judged, "scrolling sanctions the positive side only").toEqual(["left", "top"]);
  expect(probe.escapes.length, `expected the cut button — got ${JSON.stringify(probe.escapes)}`).toBe(1);
  expect(probe.escapes[0]?.side).toBe("left");
  expect(probe.escapes[0]?.px, "#439 measured 27-35px on the live surface").toBeGreaterThan(16);
  expect(probe.escapes[0]?.selector, "a finding nobody can locate is not a finding").toContain("clip-blank");
});

test("the healthy twin sweeps clean — a scroll pane, an sr-only stub and a padded badge are not escapes", async ({ mount, page }) => {
  await mount(<WalkerClippedInflowControlStory />);
  const probe = await sweep(page, "[data-testid=healthy-dialog]");

  expect(
    probe.escapes,
    "a scroller SANCTIONS content outside its box (including the control scrolled out of view), an sr-only stub paints nothing, and a badge in the container's padding is inside the clip",
  ).toEqual([]);
});

test("a scrolling side is declined and a clipping one is not — per SIDE, never per axis", async ({ mount, page }) => {
  await mount(<WalkerClippedInflowControlStory />);
  const probe = await sweep(page, "[data-testid=healthy-scroller]");

  expect(probe.scrollY, "the pane's content is far taller than the pane — the scroll arm sees this one").toBeGreaterThan(0);
  expect(probe.judged, "bottom is reachable by scrolling and belongs to the scroll delta; top never is").toEqual(["left", "top", "right"]);
  expect(probe.escapes, "otherwise every scroll container on every surface becomes a finding").toEqual([]);
});
