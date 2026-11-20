// The D355 inactive-control opacity: the least whole percent at or above the resting step at which every ink an inactive
// control paints clears 3:1 on its host, its own fill dimmed with it. The pairs a palette paints are built from the D336
// recipes, so the clamp's suite runs them (tests/ui/content/theme-scope/inactive-opacity.test.ts); these cases pin the solve.
import type { InactiveInkPair } from "@orb/kit/theme-derivation";
import { inactiveOpacityPercent } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";

const RESTING = 55;
const WHITE = { l: 1, c: 0, h: 0 };
const BLACK = { l: 0, c: 0, h: 0 };
/** A grey that clears 4.5:1 on white and no more: an active floor, dimmed under 3:1 at the resting step. */
const AA_GREY = { l: 0.565, c: 0, h: 0 };

test("a palette whose inks clear the floor at the resting step keeps the resting step", () => {
  expect(inactiveOpacityPercent([{ ink: BLACK, host: WHITE }], RESTING)).toBe(RESTING);
});

test("an ink at the active floor raises the step to the least percent that clears", () => {
  expect(inactiveOpacityPercent([{ ink: AA_GREY, host: WHITE }], RESTING)).toBe(78);
});

test("an ink on its control's own fill is judged on that fill dimmed with it, which needs a higher step than the bare host", () => {
  const onFill: InactiveInkPair = { ink: AA_GREY, host: WHITE, fill: { color: { l: 0.93, c: 0, h: 0 }, alpha: 1 } };
  const bare = inactiveOpacityPercent([{ ink: AA_GREY, host: WHITE }], RESTING);
  expect(inactiveOpacityPercent([onFill], RESTING)).toBeGreaterThan(bare);
});

test("the solve takes the step the worst pair needs", () => {
  expect(
    inactiveOpacityPercent(
      [
        { ink: BLACK, host: WHITE },
        { ink: AA_GREY, host: WHITE },
      ],
      RESTING,
    ),
  ).toBe(78);
});

test("a pair that misses the floor at full opacity is a derivation defect, never a silent step", () => {
  expect(() => inactiveOpacityPercent([{ ink: WHITE, host: WHITE }], RESTING)).toThrow(/misses the 3:1 floor at full opacity/u);
});
