import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as serdeCoreSealHealth } from "../../../../tooling/src/verify/gates/serde-core-seal-health.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The contract-derives-not-respells occurrence checks moved to native tests (`ops/contract-derives-native.test.ts`); this
// suite keeps the serde seal health policy's proof rows.
const FAMILY_TIMEOUT_MS = scaledBudget(120_000);

test(
  "the sanctioned serde domains retain their engine imports",
  () => {
    expect(verifyPolicyProofs([serdeCoreSealHealth])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);
