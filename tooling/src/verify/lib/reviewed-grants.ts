// The ONE central home for typed reviewed grants (docs/design/gate-runtime-standardization.md §"Exceptions
// and debt"). A row licenses exactly one `(policyId, subject, operation)` identity of one `reviewed-grant`
// policy; `why` and `endsWhen` are mandatory; after a complete owner run zero consumption is STALE and more
// than one matching finding is OVER-BROAD and licenses nothing (lib/gate-authority.ts owns reconciliation).
// Gate modules never import this table; the command runner hands it to `runPolicyPass` as `reviewedGrants`.
import type { ReviewedGateGrant, SelectedGatePolicy } from "../contract/gate-authority.ts";

/** Sorted by `policyId`, then `id`; `id` is `<policyId>:<short-kebab-subject>` so a row is greppable by its policy. */
export const REVIEWED_GRANTS: readonly ReviewedGateGrant[] = Object.freeze([]);

/** The rows a partial invocation may pass: a grant naming a policy the run does not know is a tool error by
 *  contract, so a pre-cutover real-tree receipt over a hand-picked roster filters to that roster first. */
export function reviewedGrantsFor(policies: readonly Pick<SelectedGatePolicy, "id">[]): readonly ReviewedGateGrant[] {
  const known = new Set(policies.map(({ id }) => id));
  return REVIEWED_GRANTS.filter((grant) => known.has(grant.policyId));
}
