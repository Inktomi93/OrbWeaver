// backends/kit/applied-effort — the wire word → the preset's 7-member effort tuple (B1). The narrowing is what
// lets every hosted wire record what it SPELLED (read back off its built options) without a second vocabulary:
// a word the tuple does not know, or no word at all, is `null` — unrecorded, never a guess.

import { EFFORT_LEVELS } from "@orb/contracts/preset";
import { effortWordOf } from "../../../../packages/inference/src/backends/kit/applied-effort.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("every tuple member round-trips, including `none` (thinking off) and `xhigh` (the openai-compat spelling of max)", () => {
  for (const level of EFFORT_LEVELS) {
    expect(effortWordOf(level)).toBe(level);
  }
  expect(effortWordOf("none")).toBe("none");
  expect(effortWordOf("xhigh")).toBe("xhigh");
});

test("anything outside the tuple is null: a foreign word, a non-string, undefined", () => {
  expect(effortWordOf("provider-default")).toBeNull();
  expect(effortWordOf("HIGH")).toBeNull();
  expect(effortWordOf(3)).toBeNull();
  expect(effortWordOf({ effort: "high" })).toBeNull();
  expect(effortWordOf(undefined)).toBeNull();
  expect(effortWordOf(null)).toBeNull();
});
