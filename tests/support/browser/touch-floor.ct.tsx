// The touch-floor CT kit's own hit-area arithmetic (tests/support/browser/touch-floor.ts + the rule it
// runs, tests/support/iso/hit-extent-walk.ts) — a real browser is the only tier that can prove
// `elementFromPoint` ownership at all (jsdom has no compositor).
//
// TWO DEFECT CLASSES OF THE INSTRUMENT ITSELF ARE PINNED HERE, both of which made the kit report the
// floor for controls that did not have it:
//
//   · #662 — `owns()` counted ANY ancestor (`hit.contains(el)`) as owning a probed point. Correct for the
//     one shape it was minted for (an overflowing touch-target pseudo has no DOM node, so where an
//     ancestor CLIPS it the box underneath legitimately answers) but structurally UN-FAILABLE for a plain
//     box-carried control alone in a padded wrapper: walking off its own box always landed back on the
//     wrapper.
//   · #2300 — the ancestor credit was then gated on the mere EXISTENCE of an absolutely-positioned pseudo,
//     never on its reach, and was itself unbounded. Replayed on the pre-#1843 `data-cta` glyph (whose only
//     pseudo was the CTA gradient ring: `inset: 0`, `pointer-events: none`) it reported 161x161 in this
//     stage's 400px wrapper for a control whose real target is its 25px box — and reported the SAME
//     161x161 for the FIXED control, whose truth is 56x56. A number that does not move when the answer
//     moves is not a measurement.
//
// EVERY ARM RUNS AT BOTH POINTERS. `--spacing-touch-target` is pointer-CONDITIONAL (D62), the hit pseudo
// is sized on it, and a fix that only lands on one pointer is half a fix — the fine arm is also where the
// pseudo is SMALLEST, i.e. where an over-crediting predicate is easiest to mistake for a correct one.
import { expect, test } from "@playwright/experimental-ct-react";
import { hitExtent, touchFloorPx } from "./touch-floor.ts";
import {
  TouchFloorBoxCarriedIsolatedStory,
  TouchFloorCtaGlyphIsolatedStory,
  TouchFloorInlinePrimaryStory,
  TouchFloorPreFixCtaGlyphStory,
  TouchFloorPseudoCarriedIsolatedStory,
} from "./touch-floor-fixtures.tsx";

for (const pointer of [
  { hasTouch: true, name: "coarse pointer" },
  { hasTouch: false, name: "fine pointer" },
] as const) {
  test.describe(`${pointer.name} — the kit's own ownership rule`, () => {
    test.use({ hasTouch: pointer.hasTouch });

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

    test("#662: an overflowing ::before pseudo still carries the floor when its control is isolated", async ({ mount, page }) => {
      await mount(<TouchFloorPseudoCarriedIsolatedStory />);
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("pseudo-carried-isolated");

      // The ancestor clause's MINTED purpose (the pseudo has no DOM node of its own) must survive both
      // fixes — this is the one shape the credit exists for, and neither #662 nor #2300 may close it.
      expect(await hitExtent(control, "x"), "a ghost glyph button's ::before must still reach the touch floor").toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(control, "y"), "a ghost glyph button's ::before must still reach the touch floor").toBeGreaterThanOrEqual(floor);
    });

    test("#1843: the SAME glyph wearing the CTA ring keeps its hit area", async ({ mount, page }) => {
      await mount(<TouchFloorCtaGlyphIsolatedStory />);
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("cta-glyph-isolated");

      // The ring lives on `::after` and the hit area on `::before`, so they coexist; before #1843 they
      // were one pseudo and the ring won. The kit could not previously state this arm at all — with
      // existence-only credit the ringed and ringless buttons reported the identical fabricated number.
      expect(await hitExtent(control, "x"), "a primary (data-cta) glyph must have the same target as its ghost twin").toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(control, "y"), "a primary (data-cta) glyph must have the same target as its ghost twin").toBeGreaterThanOrEqual(floor);
    });

    test("#2300: the PRE-#1843 ringed glyph — an untappable pseudo — measures BELOW the floor", async ({ mount, page }) => {
      await mount(<TouchFloorPreFixCtaGlyphStory />);
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("pre-fix-cta-glyph");

      // THE RED-FIRST ARM. Against the pre-fix kit this stage measured 161x161 and PASSED a floor of 55,
      // because the ring satisfied "a pseudo exists" and the credit then ran to the wrapper's own edges.
      // Its pseudo still resolves to an OUTWARD rect (the hit-area utilities' width/height/translate
      // survive the unlayered ring rule), so geometry alone would credit it too: what must disqualify it
      // is `pointer-events: none`.
      const width = await hitExtent(control, "x");
      const height = await hitExtent(control, "y");
      expect(width, `a ring nobody can tap is not a hit area — measured ${width}x${height} against a floor of ${floor}`).toBeLessThan(floor);
      expect(height, `a ring nobody can tap is not a hit area — measured ${width}x${height} against a floor of ${floor}`).toBeLessThan(floor);
    });

    test("#1843/#2301: the `inline` arm at intent=primary answers a tap over its whole hit-area ::before", async ({ mount, page }) => {
      await mount(<TouchFloorInlinePrimaryStory />);
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("inline-primary");

      // The `inline` arm's box is text-height (~18px), so the vertical answer is entirely the pseudo's —
      // and at `intent="primary"` that pseudo sits under the CTA ring, which is the exact overlap #1843
      // was about. The horizontal arm is the button's own width, which already exceeds the floor: it is
      // asserted anyway because a credit bug that collapses the walk shows up there first.
      expect(await hitExtent(control, "y"), "an inline datum's floor is carried by its ::before, ring or no ring").toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(control, "x"), "the inline arm's hit area spans its own width").toBeGreaterThanOrEqual(floor);
    });
  });
}
