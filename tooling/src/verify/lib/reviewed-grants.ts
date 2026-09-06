// The ONE central home for typed reviewed grants (docs/design/gate-runtime-standardization.md §"Exceptions
// and debt"). A row licenses exactly one `(policyId, subject, operation)` identity of one `reviewed-grant`
// policy; `why` and `endsWhen` are mandatory; after a complete owner run zero consumption is STALE and more
// than one matching finding is OVER-BROAD and licenses nothing (lib/gate-authority.ts owns reconciliation).
// Gate modules never import this table; the command runner hands it to `runPolicyPass` as `reviewedGrants`.
import type { ReviewedGateGrant, SelectedGatePolicy } from "../contract/gate-authority.ts";

/** Sorted by `policyId`, then `id`; `id` is `<policyId>:<short-kebab-subject>` so a row is greppable by its policy. */
export const REVIEWED_GRANTS: readonly ReviewedGateGrant[] = Object.freeze([
  {
    id: "route-imports-no-feature:app-root-app-shell",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/app-root.tsx",
    operation: "feature-front-door-import:#features/app-shell",
    why: "app-root.tsx is the ONE sanctioned composition route (client-architecture-lockdown.md §6): the shell it mounts is what OWNS the section/modal/chrome registries, so it cannot itself reach them through a registry that does not exist until it has mounted.",
    endsWhen: "the app shell is entered through a registry-assembled door rather than composed at the route.",
  },
  {
    id: "route-imports-no-feature:app-root-chat",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/app-root.tsx",
    operation: "feature-front-door-import:#features/chat",
    why: "the sanctioned composition route assembles the chat feature's contributor registries at the door (client-architecture-lockdown.md §12 row 5); the assembly is the door's job by construction.",
    endsWhen: "chat's contributor registries are assembled by the shell from registered contributions instead of at the route.",
  },
  {
    id: "route-imports-no-feature:app-root-persona",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/app-root.tsx",
    operation: "feature-front-door-import:#features/persona",
    why: "the sanctioned composition route assembles the persona feature's contributions at the door, on the same §12 row-5 ruling as chat.",
    endsWhen: "persona's contributions are assembled by the shell from registered contributions instead of at the route.",
  },
  {
    id: "route-imports-no-feature:login-page-auth",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/login-page.tsx",
    operation: "feature-front-door-import:#features/auth",
    why: "the login page IS the auth surface: it renders before any authenticated shell exists, so there is no registry for it to ride.",
    endsWhen: "the login surface is reached through the authenticated shell's registries, which by definition it cannot be while it is the pre-auth entry.",
  },
  {
    id: "route-imports-no-feature:router-auth",
    policyId: "route-imports-no-feature",
    subject: "packages/client/src/routes/router.tsx",
    operation: "feature-front-door-import:#features/auth",
    why: "the router's beforeLoad gate must consult auth before it can decide which route tree to build, which is strictly earlier than any registry read.",
    endsWhen: "route admission is decided by a contracts-level session fact instead of by the auth feature's own door.",
  },
]);

/** The rows a partial invocation may pass: a grant naming a policy the run does not know is a tool error by
 *  contract, so a pre-cutover real-tree receipt over a hand-picked roster filters to that roster first. */
export function reviewedGrantsFor(policies: readonly Pick<SelectedGatePolicy, "id">[]): readonly ReviewedGateGrant[] {
  const known = new Set(policies.map(({ id }) => id));
  return REVIEWED_GRANTS.filter((grant) => known.has(grant.policyId));
}
