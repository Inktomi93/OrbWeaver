import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the D162 rename-health owner passes every declared proof", () => {
  expect(verifyPolicyProofs([health])).toEqual([]);
});
