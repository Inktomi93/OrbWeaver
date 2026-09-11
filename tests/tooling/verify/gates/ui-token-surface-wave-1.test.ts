// Conformance entry for the first wave of the UI a11y/skin family's off-token gates converted to the
// final `defineGate` contract (#1584, lane p-gate-ui): no-off-token-radius-shadow, no-off-token-inline-style,
// no-hover-display-swap. Each is a SINGLETON family — none shares a `lib/` subject reader with a sibling
// today (see each gate's own header for the FAMILY DUTY receipt); they are grouped in one test file only
// because they converted in the same lane and pass, not because they are one family.
//
// All three retired an EMPTY legacy ALLOWLIST with no rows to port — there is no stale-arm/health sibling
// policy to prove here, unlike the `raw-spacing-tier` split (`no-raw-spacing-in-features` +
// `spacing-tier-home-health`), because a per-file ALLOWLIST table is superseded by the central `ordinary`
// waiver marker, not by a second whole-population policy.
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noHoverDisplaySwap } from "../../../../tooling/src/verify/gates/no-hover-display-swap.ts";
import { gate as noOffTokenInlineStyle } from "../../../../tooling/src/verify/gates/no-off-token-inline-style.ts";
import { gate as noOffTokenRadiusShadow } from "../../../../tooling/src/verify/gates/no-off-token-radius-shadow.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [noOffTokenRadiusShadow, noOffTokenInlineStyle, noHoverDisplaySwap];

// EVERY row-scaled test here says its own budget. The default is a per-TEST number and this test
// concentrates all three policies' proof sets into ONE test, so growth in the set walks it into a
// timeout that reads exactly like an assertion failure.
const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test(
  "the off-token/hover-display-swap wave keeps its founding, wrapper, carrier-fence, and false-positive fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);
