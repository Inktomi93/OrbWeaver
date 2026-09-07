// The touch-floor CT kit's own hit-area arithmetic (tests/support/ct/touch-floor.ts) — a real browser is
// the only tier that can prove `elementFromPoint` ownership at all (jsdom has no compositor).
//
// #662: `hitExtent`'s `owns()` used to count ANY ancestor (`hit.contains(el)`) as owning a probed point —
// correct for the one shape it was minted for (an overflowing `::after` touch-target pseudo has no DOM
// node, so the ancestor legitimately answers) but structurally UN-FAILABLE for a plain box-carried
// control alone in a padded wrapper: walking off its own box always landed back on the wrapper, so the
// sweep reported the full floor no matter how small the control's real box was. Both directions are
// pinned here: the box-carried stage must measure its own small box, and the pseudo-carried stage — the
// clause's one legitimate purpose — must still reach the floor.
import { expect, test } from "@playwright/experimental-ct-react";
import { hitExtent, touchFloorPx } from "./touch-floor.ts";
import { TouchFloorBoxCarriedIsolatedStory, TouchFloorPseudoCarriedIsolatedStory } from "./touch-floor-fixtures.tsx";

test.use({ hasTouch: true });

test("#662: a box-carried control alone in a padded wrapper measures its OWN box, not the wrapper", async ({ mount, page }) => {
  await mount(<TouchFloorBoxCarriedIsolatedStory />);
  const floor = await touchFloorPx(page);
  const control = page.getByTestId("box-carried-isolated");

  // The regression this exists for: the unconditional ancestor clause reported the full floor here
  // regardless of the control's real 16x16 box. A correct sweep stays close to the box, never the
  // wrapper's fabricated extent — and never claims the floor for a control that plainly does not carry it.
  const width = await hitExtent(control, "x");
  const height = await hitExtent(control, "y");
  expect(width, "a plain 16px button must not borrow its padded wrapper's width").toBeLessThan(floor);
  expect(height, "a plain 16px button must not borrow its padded wrapper's height").toBeLessThan(floor);
});

test("#662: an overflowing ::after pseudo still carries the floor when its control is isolated", async ({ mount, page }) => {
  await mount(<TouchFloorPseudoCarriedIsolatedStory />);
  const floor = await touchFloorPx(page);
  const control = page.getByTestId("pseudo-carried-isolated");

  // The ancestor clause's MINTED purpose (the pseudo has no DOM node of its own) must survive the fix —
  // this is the one shape ancestor-credit exists for, and closing #662 must not also close this.
  expect(await hitExtent(control, "x"), "a glyph button's overflowing ::after must still reach the coarse touch floor").toBeGreaterThanOrEqual(floor);
  expect(await hitExtent(control, "y"), "a glyph button's overflowing ::after must still reach the coarse touch floor").toBeGreaterThanOrEqual(floor);
});
