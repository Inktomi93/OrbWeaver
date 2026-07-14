// Unit: the generation-duration derivation for the PD-130 `showGenerationTimer` metadata readout
// (features/chat/lib/gen-duration). Pins the both-bounds-present-and-ordered guard (matching the stats
// gen-time axis) and the sub-second-`ms` / else-`N.Ns` label formatting.

import {
  genDurationLabel,
  genDurationMs,
} from "../../../../../packages/client/src/features/chat/lib/gen-duration";
import { expect, test } from "../../../../support/fixtures";

test("genDurationMs returns the ordered window gf − gs", () => {
  expect(genDurationMs(1000, 4400)).toBe(3400);
});

test("genDurationMs is null when either bound is absent (non-generated / in-flight row)", () => {
  expect(genDurationMs(null, 4400)).toBeNull();
  expect(genDurationMs(1000, null)).toBeNull();
  expect(genDurationMs(null, null)).toBeNull();
});

test("genDurationMs is null when the bounds are inverted (never negative)", () => {
  expect(genDurationMs(4400, 1000)).toBeNull();
});

test("genDurationMs allows a zero-length window (equal bounds)", () => {
  expect(genDurationMs(1000, 1000)).toBe(0);
});

test("genDurationLabel renders whole milliseconds under one second", () => {
  expect(genDurationLabel(0, 820)).toBe("820ms");
  expect(genDurationLabel(0, 0)).toBe("0ms");
});

test("genDurationLabel renders one-decimal seconds at or above one second", () => {
  expect(genDurationLabel(0, 1000)).toBe("1.0s");
  expect(genDurationLabel(0, 3400)).toBe("3.4s");
  expect(genDurationLabel(1000, 13_500)).toBe("12.5s");
});

test("genDurationLabel is null when there is no complete window to show", () => {
  expect(genDurationLabel(null, 4400)).toBeNull();
  expect(genDurationLabel(4400, 1000)).toBeNull();
});
