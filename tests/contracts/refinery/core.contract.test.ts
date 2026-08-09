// contracts/refinery/core — the re-homed rubric bounds + verdict vocabulary (the schema-authoring belt's
// well-known-core inputs). Pins the exact spellings the prompts teach and the loop's stop condition rides.

import { REFINERY_VERDICTS, refineryVerdictSchema, SCORE_MAX, SCORE_MIN } from "@orb/contracts/refinery";
import { expect, test } from "../../support/fixtures.ts";

test("the rubric bounds are the extension's 1-10 and the verdict spellings are verbatim uppercase", () => {
  expect(SCORE_MIN).toBe(1);
  expect(SCORE_MAX).toBe(10);
  expect(REFINERY_VERDICTS).toEqual(["ACCEPT", "NEEDS_REFINEMENT", "REGRESSION"]);
  expect(refineryVerdictSchema.safeParse("REGRESSION").success).toBe(true);
  // Case matters — the loop's stop condition matches the uppercase spelling only.
  expect(refineryVerdictSchema.safeParse("regression").success).toBe(false);
});
