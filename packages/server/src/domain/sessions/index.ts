// domain/sessions — FRONT DOOR: the only legal external import. Cross-boundary types are re-exported
// type-only; their canonical home is @orb/contracts.

export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
export type { SessionView } from "@orb/contracts/session";
// The OIDC callback resolves these admission decisions; its port types them from here, never re-spelled.
export type { ProvisionIdentityOptions } from "./contract/params.ts";
// The `loadUserById` row-fields shape — the auth seam's row→`Principal` mapper takes it directly, so the
// mapper and the two resolvers built on it (host bridge · request fallback) never re-spell the read.
// `RevokedSessionsSummary` rides out for the same reason: entry's back-channel-logout route consumes the
// WHOSE half to evict those users' live sockets (W7a).
export type { RevokedSessionsSummary, UserPrincipalFields } from "./contract/results.ts";
export type { SessionsService } from "./contract/service.ts";
export { createOidcStore } from "./persistence/oidc-store.ts";
export { createSessionsService } from "./service.ts";
// Exported so entry's boot owner-seed and the login-derived role path can never fork.
// `groupRoleGovernanceActive` rides out for the same no-fork reason: entry's OIDC claim mapper asks THIS
// predicate — never a second env read — whether an absent `groups` claim is a normal shape or a
// silently-disabled control (#140).
// `isReservedSignupHandle` rides out for the signup route (D259): entry refuses a reserved handle before any
// password hashing, through this one predicate.
export { groupRoleGovernanceActive, isReservedSignupHandle, ownerHandles } from "./substrate/role-policy.ts";
export { createTokenHasher } from "./tokens/tokens.ts";
