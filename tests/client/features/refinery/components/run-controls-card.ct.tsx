// CT: the run bar at a narrow container width — the P1 overlap proof (side-eye 2026-08-09). The verb
// cluster was `min-w-0 flex-1`, so at the 3-pane / mobile width it shrank BELOW its own buttons and they
// overflowed their box, painting the §8 fit-line readout THROUGH the Hand-edit button (~31px at 3-pane).
// The fix flex-wraps the fit-line + verb row and restores the cluster's content floor, so the verbs drop
// to their own line before they can ever sit on top of the readout. Geometry, not classes: this asserts
// the fit-line box shares NO pixels with any verb box (a className check cannot see an overlap).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { RunControlsCardStory } from "../_ct-stories.tsx";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// The narrow content width where the OLD collapsed-cluster layout overlapped; the wrapped NEW layout does
// not. Between the 3-pane desktop and the mobile CONTENT pane — both narrow enough to force the wrap.
const NARROW_PX = 440;

async function rectOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("element has no bounding box");
  }
  return box;
}

/** Do two rendered rectangles share any pixels? (An overlap the old fit-line/button collision produced.) */
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test("the fit-line readout overlaps NO verb at a narrow container width — it wraps clear of the cluster (P1)", async ({ mount, page }) => {
  await mount(<RunControlsCardStory width={NARROW_PX} />);

  const fit = page.getByTestId("refinery-fit-line");
  const handEdit = page.getByRole("button", { name: "Hand-edit" });
  const iterate = page.getByRole("button", { name: "Iterate" });
  await expect(fit).toBeVisible();
  await expect(handEdit).toBeVisible();
  await expect(iterate).toBeVisible();

  const fitRect = await rectOf(fit);
  // The readout shares no pixels with any verb — under the old `min-w-0 flex-1` cluster it painted through
  // Hand-edit (the leftmost, first-overlapped verb) and the analyze cluster beyond it.
  expect(intersects(fitRect, await rectOf(handEdit)), "fit-line must not overlap Hand-edit").toBe(false);
  expect(intersects(fitRect, await rectOf(iterate)), "fit-line must not overlap Iterate").toBe(false);
});
