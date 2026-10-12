// CT: the FOOT run bar at a narrow container width — the surviving half of the P1-2 geometry proof
// (side-eye 2026-08-09). One Row once held the guidance Field beside the verb cluster; the verbs are
// min-content and `shrink-0`, so the Field — the only flexible child — was squeezed to 26px, i.e. the
// surface's primary text input was unusable at the width it actually ships at. Two rows is the fix the
// geometry demands, and this asserts it in PIXELS: an input and its action cluster cannot share one line's
// slack, so the input must keep a usable width and share none of its box with a verb.
//
// (The §8 fit-line half of the original proof moved with the fit line itself — it is per-STAGE data and now
// lives in each lane's own run control; its rail-width geometry is lane-run-control.ct.tsx.)

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { RunControlsCardStory } from "../_ct-stories.tsx";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The narrow content width the old collapsed layout failed at — between the 3-pane desktop and the mobile
 *  CONTENT pane, both narrow enough to force the split. */
const NARROW_PX = 440;
/** The floor a two-line textarea has to clear to be a text input at all rather than a sliver. The old
 *  single-row layout measured 26px here. */
const USABLE_INPUT_PX = 200;

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

test("the guidance field keeps a usable width at a narrow container and shares no pixels with the verb cluster (P1-2)", async ({ mount, page }) => {
  await mount(<RunControlsCardStory width={NARROW_PX} />);

  const guidance = page.getByRole("textbox", { name: "Guidance · every stage" });
  const handEdit = page.getByRole("button", { name: "Hand-edit" });
  const iterate = page.getByRole("button", { name: "Iterate" });
  await expect(guidance).toBeVisible();
  await expect(handEdit).toBeVisible();
  await expect(iterate).toBeVisible();

  const guidanceRect = await rectOf(guidance);
  expect(guidanceRect.width, "the guidance input is a text input, not a sliver").toBeGreaterThan(USABLE_INPUT_PX);
  expect(intersects(guidanceRect, await rectOf(handEdit)), "guidance must not overlap Hand-edit").toBe(false);
  expect(intersects(guidanceRect, await rectOf(iterate)), "guidance must not overlap Iterate").toBe(false);
});
