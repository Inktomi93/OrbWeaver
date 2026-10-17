// The retained schema-registry policy runs its declared cases through the production proof runtime.
// Lifecycle portability is qualified against native schema and composed router/HTTP registrations.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as domainFreshnessPlane } from "../../../../tooling/src/verify/gates/domain-freshness-plane.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

// "domain-freshness-plane" remains discoverable to the affected-instrument runner.
test("domain freshness retains every declared schema-registry proof", { tags: ["slow"] }, () => {
  expect(verifyPolicyProofs([domainFreshnessPlane])).toEqual([]);
});
