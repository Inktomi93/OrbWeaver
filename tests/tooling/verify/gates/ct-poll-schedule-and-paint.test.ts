import { gate as occurrence } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a shared poll schedule and an unbarriered evaluate trigger are flagged, and the founding anchor stays sound", () => {
  expect(verifyPolicyProofs([occurrence, health])).toEqual([]);
});
