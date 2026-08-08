// The capped-field grammar's pure half: the counter-visibility predicate BOTH the counter itself and any
// footer wrapping it read, so "is there anything to draw?" is answered in one place. The boundary is asserted
// from both sides — an off-by-one there is invisible on screen until a field sits exactly on it, and it is
// what decides whether a footer renders an empty row.

import { describe } from "vitest";
import { CAPPED_FIELD_MAX_ROWS, DEFAULT_COUNTER_AT, showsCappedFieldCounter } from "../../../packages/client/src/forms/capped-field-model.ts";
import { expect, test } from "../../support/fixtures.ts";

const MAX = 4000;

describe("showsCappedFieldCounter", () => {
  test("is silent below the threshold and shows at it", () => {
    expect(showsCappedFieldCounter(MAX * DEFAULT_COUNTER_AT - 1, MAX)).toBe(false);
    expect(showsCappedFieldCounter(MAX * DEFAULT_COUNTER_AT, MAX)).toBe(true);
  });

  test("stays shown once the length is OVER the cap — the refusal state, never a wrap-around to quiet", () => {
    expect(showsCappedFieldCounter(MAX + 500, MAX)).toBe(true);
  });

  test("takes the caller's own threshold when the cap's contract states one", () => {
    expect(showsCappedFieldCounter(MAX * 0.5, MAX, 0.5)).toBe(true);
    expect(showsCappedFieldCounter(MAX * 0.5 - 1, MAX, 0.5)).toBe(false);
  });
});

describe("CAPPED_FIELD_MAX_ROWS", () => {
  // The ceiling exists so a capped field's box PLUS its footer clear a fold: a value long enough to need the
  // cap must not be able to push the counter/refusal off screen (side-eye PROSE-LIMIT P1). The rendered proof
  // is the two editors' CTs; this pins the number stays in the band that claim rests on.
  test("is a line count whose box plus footer clears a fold", () => {
    expect(CAPPED_FIELD_MAX_ROWS).toBeGreaterThan(4);
    expect(CAPPED_FIELD_MAX_ROWS).toBeLessThan(20);
  });
});
