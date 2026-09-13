import { gate } from "../../../../tooling/src/verify/gates/no-nul-bytes-in-source.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("preserves raw-byte occurrences, source fences and unavailable-tree refusal through production dispatch", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
