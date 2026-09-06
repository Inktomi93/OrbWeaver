import { expect, test } from "vitest";
import { gate as brandInNamePosition } from "../../../../tooling/src/verify/gates/brand-in-name-position.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("canonical id brands flow through signature positions and the central waiver plane", () => {
  expect(verifyPolicyProofs([brandInNamePosition])).toEqual([]);
});
