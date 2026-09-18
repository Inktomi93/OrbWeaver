import { gate as wireVocabulary } from "../../../../tooling/src/verify/gates/wire-schema-vocab-one-home.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("wire vocabulary evidence missing its engine fails closed", () => {
  expect(wireVocabulary.mustRefuse.some((proof) => proof.expect.messageIncludes.includes("has no BOUND_KEYWORDS initializer"))).toBe(true);
  expect(verifyPolicyProofs([wireVocabulary])).toEqual([]);
});
