// Reviewed grants: test-production-clone. Each row is a test-tree function the gate found with the shape of an exported
// production function when it landed (docs/law/Spine-Testing.md §10). Delete a row when the test calls production;
// central liveness reds a row whose copy is gone. A new copy calls production instead of taking a row.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-production-clone";

/** One grant per `[subject, operation]`; the operation names the copy and its first production twin. */
function cloneGrants(rows: readonly (readonly [string, string])[]): readonly ReviewedGateGrant[] {
  return rows.map(([subject, operation]) => ({
    id: `${POLICY}:${subject}#${operation}`,
    policyId: POLICY,
    subject,
    operation,
    why: `${subject} re-declared the body of an exported production function when the gate landed, so it keeps passing when that rule changes.`,
    endsWhen: "the test imports and calls the production function (burn-down: docs/work item 890); this row then consumes nothing and reds stale.",
  }));
}

export const REVIEWED_GRANTS_TEST_PRODUCTION_CLONE: readonly ReviewedGateGrant[] = cloneGrants([]);
