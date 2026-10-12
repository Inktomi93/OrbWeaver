import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/wire-schema-vocab-one-home.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("wire vocabulary evidence missing its engine fails closed", () => {
  expect(gate.mustRefuse.some((proof) => proof.expect.messageIncludes.includes("has no BOUND_KEYWORDS initializer"))).toBe(true);
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
