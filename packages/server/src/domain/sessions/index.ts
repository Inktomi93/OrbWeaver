// domain/sessions — FRONT DOOR: the only legal external import. Cross-boundary types are re-exported
// type-only; their canonical home is @orb/contracts.

export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
export type { SessionView } from "@orb/contracts/session";
// The `loadUserById` row-fields shape — the auth seam's row→`Principal` mapper takes it directly, so the
// mapper and the two resolvers built on it (host bridge · request fallback) never re-spell the read.
export type { UserPrincipalFields } from "./contract/results.ts";
export type { SessionsService } from "./contract/service.ts";
export type { ViewerView } from "./contract/views.ts";
export { createOidcStore } from "./persistence/oidc-store.ts";
export { createSessionsService } from "./service.ts";
// Exported so entry's boot owner-seed and the login-derived role path can never fork.
export { ownerHandles } from "./substrate/role-policy.ts";
export { createTokenHasher } from "./tokens/tokens.ts";
