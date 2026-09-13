import { gate } from "../../../../tooling/src/verify/gates/no-media-queries-in-features.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("shared token metadata is projected onto valid findings without losing viewport proof coverage", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
