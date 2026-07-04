// Unit: `isContinueEligible` (features/chat/lib/continue-on-empty) — the composer's continue-on-
// empty-send predicate. Pins the ONE rule: eligible only when the tail turn is assistant.

import { isContinueEligible } from "../../../../../packages/client/src/features/chat/lib/continue-on-empty";
import { expect, test } from "../../../../support/fixtures";

test("assistant tail → eligible", () => {
  expect(isContinueEligible("assistant")).toBe(true);
});

test("user tail → not eligible", () => {
  expect(isContinueEligible("user")).toBe(false);
});

test("system tail → not eligible", () => {
  expect(isContinueEligible("system")).toBe(false);
});

test("no tail (empty chat / draft) → not eligible", () => {
  expect(isContinueEligible(null)).toBe(false);
});
