import { processMacros, processMacrosOutcome } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";

const options = { char: "C", user: "U", persona: "P", scenario: "S", env: {} };

test("a render the byte budget cuts short reports degraded, while a render that is empty by its macros does not", () => {
  // Over the output budget and under the input limit; then over the input limit.
  for (const text of ["x".repeat(1_500_000), "x".repeat(2_500_000)]) {
    const outcome = processMacrosOutcome(text, options);
    expect(outcome).toEqual({ text: "", degraded: true });
    // The degrade-to-empty that every other caller reads is unchanged.
    expect(processMacros(text, options)).toBe("");
  }
  expect(processMacrosOutcome("{{setvar::mood::calm}}", options)).toEqual({ text: "", degraded: false });
  expect(processMacrosOutcome("x".repeat(900_000), options)).toEqual({ text: "x".repeat(900_000), degraded: false });
});
