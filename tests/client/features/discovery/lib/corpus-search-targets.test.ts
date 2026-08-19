// The corpus omnibox's NEAREST-ONLY band (side-eye corpus re-pass #3, P2-B) — the one decision on the
// target axis that is a judgment rather than a lookup, and the one whose constants were measured against the
// owner's live library rather than chosen (the table lives in `corpus-search-targets.ts`).
//
// WHAT IS PINNED HERE AND WHY: that the band is PER TARGET (gibberish scores .20 against images and .60
// against digests — a single constant is wrong somewhere by construction), and that an empty list is never
// "degraded" (it has its own designed empty state, and `Math.max()` of nothing is -Infinity). The banner's
// rendering is a CT's job (`corpus-search-results.ct.tsx`); this is the arithmetic underneath it.

import { describe } from "vitest";
import { CORPUS_NEAREST_ONLY_BELOW, isNearestOnly } from "../../../../../packages/client/src/features/discovery/lib/corpus-search-targets.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("isNearestOnly", () => {
  test("flags a set whose best hit is under the target's measured band", () => {
    // The reported defect, as numbers: `zzqqxwvfoobarbaz` over Memories returned 39-41%.
    expect(isNearestOnly("digests", [0.41, 0.39, 0.39])).toBe(true);
  });

  test("leaves a real answer alone", () => {
    expect(isNearestOnly("digests", [0.88, 0.61])).toBe(false);
  });

  test("reads the band PER TARGET — the same number is noise on one index and an answer on another", () => {
    // .41 is below the digest band (.61) and well above the image band (.35): the image index's gibberish
    // ceiling measured .202, so a .41 image hit is a genuine match. One constant could not say both.
    expect(isNearestOnly("digests", [0.41])).toBe(true);
    expect(isNearestOnly("images", [0.41])).toBe(false);
  });

  test("never flags an empty list — that state is the empty state's, not the banner's", () => {
    expect(isNearestOnly("characters", [])).toBe(false);
  });

  test("keeps every band inside the readable [0,1] similarity range it is compared against", () => {
    for (const band of Object.values(CORPUS_NEAREST_ONLY_BELOW)) {
      expect(band).toBeGreaterThan(0);
      expect(band).toBeLessThan(1);
    }
  });
});
