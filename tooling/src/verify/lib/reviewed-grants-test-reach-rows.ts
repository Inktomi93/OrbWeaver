// The one row shape for `test-reach` grants: a module path and the surface it owes, under the burn-down item.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-reach";

/** One grant per module. The operation is the gate's `unreached:<surface>` token. */
export function testReachGrants(surface: string, modules: readonly string[]): readonly ReviewedGateGrant[] {
  return modules.map((subject) => ({
    id: `${POLICY}:${subject}`,
    policyId: POLICY,
    subject,
    operation: `unreached:${surface}`,
    why: `${subject} was reached by no test of the kind its ${surface} surface owes when presence became reach; the tests near it reach it only through a composition root, a sibling module or a type import.`,
    endsWhen: `a test imports ${subject} and uses one of its exports, or names it in an @subject header (burn-down: docs/work item 915); this row then consumes nothing and reds stale.`,
  }));
}
