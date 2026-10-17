import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";

import { gate as noFakeDisabledId } from "../../../../tooling/src/verify/gates/no-fake-disabled-id.ts";
import { gate as noLooseIdCast } from "../../../../tooling/src/verify/gates/no-loose-id-cast.ts";
import { gate as noRawId } from "../../../../tooling/src/verify/gates/no-raw-id.ts";
import { gate as typeidPrefixBoundary } from "../../../../tooling/src/verify/gates/typeid-prefix-boundary.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const POLICIES = [noFakeDisabledId, noLooseIdCast, noRawId, typeidPrefixBoundary] as const;

test("canonical id brands flow through signature positions and the central waiver plane", {
  timeout: POLICIES.flatMap(policyProofRows).length * 1000,
}, () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});
