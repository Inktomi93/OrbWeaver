// The ONE central home for typed reviewed grants (docs/design/gate-runtime-standardization.md §5).
// A row licenses exactly one `(policyId, subject, operation)` identity of one `reviewed-grant`
// policy; `why` and `endsWhen` are mandatory; after a complete owner run over its whole declared population
// zero consumption is STALE (a subset run reports it unjudged), and more than one matching finding is
// OVER-BROAD and licenses nothing (lib/gate-authority.ts owns reconciliation).
// Gate modules never import this table; the command runner hands it to `runPolicyPass` as `reviewedGrants`.
//
// The grant data is split by section into sibling `reviewed-grants-<section>.ts` files, each exporting a
// partial `ReviewedGateGrant[]`. This barrel combines them with a frozen, sorted array.
import type { ReviewedGateGrant, SelectedGatePolicy } from "../contract/gate-authority.ts";
import { REVIEWED_GRANTS_ASSETS_TO_HOME } from "./reviewed-grants-assets-to-home.ts";
import { REVIEWED_GRANTS_DANGLINGREFCITATIONS } from "./reviewed-grants-danglingrefcitations.ts";
import { REVIEWED_GRANTS_DBSTRUCTUREPRODUCERHOME_DANGLINGREFCITATIONS } from "./reviewed-grants-dbstructureproducerhome-danglingrefcitations.ts";
import { REVIEWED_GRANTS_DENSITY_TIER_A } from "./reviewed-grants-density-tier-a.ts";
import { REVIEWED_GRANTS_DENSITY_TIER_B } from "./reviewed-grants-density-tier-b.ts";
import { REVIEWED_GRANTS_DEPCRUISE_TO_EGRESS } from "./reviewed-grants-depcruise-to-egress.ts";
import { REVIEWED_GRANTS_MEMBERSHIP_WRITE_FAN } from "./reviewed-grants-membership-write-fan.ts";
import { REVIEWED_GRANTS_NO_TO_FACTORY } from "./reviewed-grants-no-to-factory.ts";
import { REVIEWED_GRANTS_NO_UNRULED_FLIP_INVERSION } from "./reviewed-grants-no-unruled-flip-inversion.ts";
import { REVIEWED_GRANTS_SINGLESTREAMTRANSPORT_SOLEENVREADER } from "./reviewed-grants-singlestreamtransport-soleenvreader.ts";
import { REVIEWED_GRANTS_SUPPRESSIONS_A } from "./reviewed-grants-suppressions-a.ts";
import { REVIEWED_GRANTS_SUPPRESSIONS_B } from "./reviewed-grants-suppressions-b.ts";
import { REVIEWED_GRANTS_TAILWIND } from "./reviewed-grants-tailwind.ts";
import { REVIEWED_GRANTS_TOOLING_TO_PERMISSION } from "./reviewed-grants-tooling-to-permission.ts";
import { REVIEWED_GRANTS_Z_TO_CITATIONS } from "./reviewed-grants-z-to-citations.ts";
import { REVIEWED_GRANTS_ZODERRORISSUES_ZINDEX } from "./reviewed-grants-zoderrorissues-zindex.ts";

/** Sorted by `policyId`, then `id`; `id` is `<policyId>:<short-kebab-subject>` so a row is greppable by its policy.
 *  The sort is enforced mechanically: the array is sorted at definition time rather than relying on
 *  hand-maintained insertion order across generated spreads. */
export const REVIEWED_GRANTS: readonly ReviewedGateGrant[] = Object.freeze(
  (
    [
      ...REVIEWED_GRANTS_ASSETS_TO_HOME,
      ...REVIEWED_GRANTS_DBSTRUCTUREPRODUCERHOME_DANGLINGREFCITATIONS,
      ...REVIEWED_GRANTS_DENSITY_TIER_A,
      ...REVIEWED_GRANTS_DENSITY_TIER_B,
      ...REVIEWED_GRANTS_DEPCRUISE_TO_EGRESS,
      ...REVIEWED_GRANTS_MEMBERSHIP_WRITE_FAN,
      ...REVIEWED_GRANTS_NO_TO_FACTORY,
      ...REVIEWED_GRANTS_NO_UNRULED_FLIP_INVERSION,
      ...REVIEWED_GRANTS_SINGLESTREAMTRANSPORT_SOLEENVREADER,
      ...REVIEWED_GRANTS_SUPPRESSIONS_A,
      ...REVIEWED_GRANTS_SUPPRESSIONS_B,
      ...REVIEWED_GRANTS_TAILWIND,
      ...REVIEWED_GRANTS_TOOLING_TO_PERMISSION,
      ...REVIEWED_GRANTS_Z_TO_CITATIONS,
      ...REVIEWED_GRANTS_ZODERRORISSUES_ZINDEX,
      ...REVIEWED_GRANTS_DANGLINGREFCITATIONS,
    ] satisfies ReviewedGateGrant[]
  ).toSorted((a, b) => {
    const p = a.policyId.localeCompare(b.policyId);
    return p !== 0 ? p : a.id.localeCompare(b.id);
  }),
);

/** The rows a partial invocation may pass: a grant naming a policy the run does not know is a tool error by
 *  contract, so a pre-cutover real-tree receipt over a hand-picked roster filters to that roster first. */
export function reviewedGrantsFor(policies: readonly Pick<SelectedGatePolicy, "id">[]): readonly ReviewedGateGrant[] {
  const known = new Set(policies.map(({ id }) => id));
  return REVIEWED_GRANTS.filter((grant) => known.has(grant.policyId));
}
