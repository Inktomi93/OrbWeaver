// `trpc-input-declarations` reports a procedure that reads `input` without a zod parser or with a pass-anything one, in
// the dotted and the bracket spelling of every member read it judges. The declared rows carry each plant; this runs them.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/trpc-input-declarations.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test(
  "every catch and pass row holds through the production dispatcher",
  () => {
    expect(verifyPolicyProofs([gate])).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);
