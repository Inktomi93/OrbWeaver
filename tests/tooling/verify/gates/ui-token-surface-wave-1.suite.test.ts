// The receded-ink source policy retains semantics beyond native Tailwind class validity.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as recededInkIntegrity } from "../../../../tooling/src/verify/gates/receded-ink-integrity.ts";
import { policyFamilyNames } from "../../../../tooling/src/verify/lib/policy-module.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [recededInkIntegrity];

// EVERY row-scaled test here says its own budget. The default is a per-TEST number and this test
// concentrates the policy's proof set into ONE test, so growth in the set walks it into a
// timeout that reads exactly like an assertion failure.
const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test("the retained ink policy registers as a valid singleton family", () => {
  expect(policyFamilyNames(FAMILY)).toEqual(FAMILY.map(({ id }) => id).toSorted());
});

test(
  "the receded-ink policy keeps its founding, wrapper, carrier-fence, and false-positive fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);
