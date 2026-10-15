// Source policies retain inline-style and interaction semantics beyond native Tailwind class validity.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noHoverDisplaySwap } from "../../../../tooling/src/verify/gates/no-hover-display-swap.ts";
import { gate as noOffTokenInlineStyle } from "../../../../tooling/src/verify/gates/no-off-token-inline-style.ts";
import { gate as recededInkIntegrity } from "../../../../tooling/src/verify/gates/receded-ink-integrity.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [noOffTokenInlineStyle, noHoverDisplaySwap, recededInkIntegrity];

// EVERY row-scaled test here says its own budget. The default is a per-TEST number and this test
// concentrates all three policies' proof sets into ONE test, so growth in the set walks it into a
// timeout that reads exactly like an assertion failure.
const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test(
  "the off-token/hover-display-swap/receded-ink wave keeps its founding, wrapper, carrier-fence, and false-positive fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);
