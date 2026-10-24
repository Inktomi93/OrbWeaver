// The touch-floor CT kit's own hit-area arithmetic (tests/support/browser/touch-floor.ts + the rule it
// runs, tests/support/iso/hit-extent-walk.ts) — a real browser is the only tier that can prove
// `elementFromPoint` ownership at all (jsdom has no compositor).
//
// TWO DEFECT CLASSES OF THE INSTRUMENT ITSELF ARE PINNED HERE, both of which made the kit report the
// floor for controls that did not have it:
//
//   · Ancestor credit must not be unconditional. Crediting ANY ancestor (`hit.contains(el)`) as owning a
//     probed point is right only for an overflowing touch-target pseudo (it has no DOM node, so where an
//     ancestor CLIPS it the box underneath legitimately answers); it is structurally UN-FAILABLE for a plain
//     box-carried control alone in a padded wrapper, because walking off its own box lands on the wrapper.
//   · Ancestor credit must be gated on the pseudo's reach, not its mere EXISTENCE. A `data-cta` glyph whose
//     only pseudo is the CTA gradient ring (`inset: 0`, `pointer-events: none`) would otherwise report the
//     wrapper's 161x161 for a control whose real target is its 25px box, and the SAME number for the
//     control with a real hit area. A number that does not move when the answer moves is not a measurement.
//
// EVERY ARM RUNS AT BOTH POINTERS. `--spacing-touch-target` is pointer-CONDITIONAL (D62), the hit pseudo
// is sized on it, and a fix that only lands on one pointer is half a fix — the fine arm is also where the
// pseudo is SMALLEST, i.e. where an over-crediting predicate is easiest to mistake for a correct one.
import { expect, test } from "@playwright/test";
import { hitExtent, measurePitch, touchFloorPx } from "./touch-floor.ts";
import type {
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

    test("a box-carried control alone in a padded wrapper measures its OWN box, not the wrapper", async ({ mount, page }) => {
      await mount<typeof TouchFloorBoxCarriedIsolatedStory>("tests/support/browser/touch-floor-fixtures/TouchFloorBoxCarriedIsolatedStory", {});
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("box-carried-isolated");

      // An unconditional ancestor clause would report the full floor here regardless of the
      // control's real 16x16 box. A correct sweep stays close to the box, never the
      // wrapper's fabricated extent — and never claims the floor for a control that plainly does not carry it.
      const width = await hitExtent(control, "x");
      const height = await hitExtent(control, "y");
      expect(width, "a plain 16px button must not borrow its padded wrapper's width").toBeLessThan(floor);
      expect(height, "a plain 16px button must not borrow its padded wrapper's height").toBeLessThan(floor);
    });

    test("an overflowing ::before pseudo still carries the floor when its control is isolated", async ({ mount, page }) => {
      await mount<typeof TouchFloorPseudoCarriedIsolatedStory>("tests/support/browser/touch-floor-fixtures/TouchFloorPseudoCarriedIsolatedStory", {});
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("pseudo-carried-isolated");

      // The ancestor clause's purpose (the pseudo has no DOM node of its own) must survive the
      // box-carried and existence-only guards — this is the one shape the credit exists for.
      expect(await hitExtent(control, "x"), "a ghost glyph button's ::before must still reach the touch floor").toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(control, "y"), "a ghost glyph button's ::before must still reach the touch floor").toBeGreaterThanOrEqual(floor);
    });

    test("the SAME glyph wearing the CTA ring keeps its hit area", async ({ mount, page }) => {
      await mount<typeof TouchFloorCtaGlyphIsolatedStory>("tests/support/browser/touch-floor-fixtures/TouchFloorCtaGlyphIsolatedStory", {});
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("cta-glyph-isolated");

      // The ring lives on `::after` and the hit area on `::before`, so they coexist; on one shared
      // pseudo the ring would win. Existence-only credit could not tell the ringed and ringless buttons apart.
      expect(await hitExtent(control, "x"), "a primary (data-cta) glyph must have the same target as its ghost twin").toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(control, "y"), "a primary (data-cta) glyph must have the same target as its ghost twin").toBeGreaterThanOrEqual(floor);
    });

    test("a ringed glyph whose hit area shares the ring's pseudo — an untappable pseudo — measures BELOW the floor", async ({ mount, page }) => {
      await mount<typeof TouchFloorPreFixCtaGlyphStory>("tests/support/browser/touch-floor-fixtures/TouchFloorPreFixCtaGlyphStory", {});
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("pre-fix-cta-glyph");

      // THE NEGATIVE CONTROL. Existence-only credit would measure 161x161 here and pass a floor of 55,
      // because the ring satisfies "a pseudo exists" and the credit then runs to the wrapper's own edges.
      // Its pseudo still resolves to an OUTWARD rect (the hit-area utilities' width/height/translate
      // survive the unlayered ring rule), so geometry alone would credit it too: what must disqualify it
      // is `pointer-events: none`.
      const width = await hitExtent(control, "x");
      const height = await hitExtent(control, "y");
      expect(width, `a ring nobody can tap is not a hit area — measured ${width}x${height} against a floor of ${floor}`).toBeLessThan(floor);
      expect(height, `a ring nobody can tap is not a hit area — measured ${width}x${height} against a floor of ${floor}`).toBeLessThan(floor);
    });

    test("the `inline` arm at intent=primary answers a tap over its whole hit-area ::before", async ({ mount, page }) => {
      await mount<typeof TouchFloorInlinePrimaryStory>("tests/support/browser/touch-floor-fixtures/TouchFloorInlinePrimaryStory", {});
      const floor = await touchFloorPx(page);
      const control = page.getByTestId("inline-primary");

      // The `inline` arm's box is text-height (~18px), so the vertical answer is entirely the pseudo's —
      // and at `intent="primary"` that pseudo sits under the CTA ring, the overlap this arm
      // exists to cover. The horizontal arm is the button's own width, which already exceeds the floor: it is
      // asserted anyway because a credit bug that collapses the walk shows up there first.
      expect(await hitExtent(control, "y"), "an inline datum's floor is carried by its ::before, ring or no ring").toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(control, "x"), "the inline arm's hit area spans its own width").toBeGreaterThanOrEqual(floor);
    });
  });
}

test("maintained browser boundaries: pitch retains first-sibling origin and unconstrained axes", async ({ page }) => {
  await page.setContent(
    '<div id="grid" style="position:relative"><span style="position:absolute;left:20px;top:10px;width:20px;height:10px"></span><button type="button" style="position:absolute;left:70px;top:10px;width:20px;height:10px;padding:0;border:0">Second</button><button type="button" style="position:absolute;left:20px;top:70px;width:20px;height:10px;padding:0;border:0">Third</button></div><div id="single"><button type="button">Only</button></div>',
  );
  expect(await measurePitch(page.locator("#grid button"))).toEqual({ x: 50, y: 60 });
  expect(await measurePitch(page.locator("#single button"))).toEqual({ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY });
  await expect(measurePitch(page.locator("html"))).rejects.toThrow();
});
