// domain/sessions — FRONT DOOR: the only legal external import. Cross-boundary types are re-exported
// type-only; their canonical home is @orb/contracts.

export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
export type { SessionView } from "@orb/contracts/session";
// The OIDC callback resolves these admission decisions; its port types them from here, never re-spelled.
export type { SeedOwnerParams } from "./contract/boot.ts";
export type { ProvisionIdentityOptions } from "./contract/params.ts";
// The `loadUserById` row-fields shape — the auth seam's row→`Principal` mapper takes it directly, so the
// mapper and the two resolvers built on it (host bridge · request fallback) never re-spell the read.
// `RevokedSessionsSummary` rides out for the same reason: entry's back-channel-logout route consumes the
// WHOSE half to evict those users' live sockets (W7a).
export type { RevokedSessionsSummary, UserPrincipalFields } from "./contract/results.ts";
export type { SessionsRolePolicy, SessionsRolePolicyConfig } from "./contract/role-policy.ts";
export type { SessionsService } from "./contract/service.ts";
export { createOidcStore } from "./persistence/oidc-store.ts";
export { createListSeedAccountIds, selectHandleById, selectHandlesByIds } from "./persistence/users.ts";
export { createSessionsService } from "./service.ts";
export { createSessionsRolePolicy } from "./substrate/role-policy.ts";
export { createTokenHasher } from "./tokens/tokens.ts";
// The disabled-account containment read compose wires into every non-request consumer (fail-closed on a missing row).
export { createResolveUserEnabled } from "./verbs/resolve-user-enabled.ts";
export { createSeedOwner } from "./verbs/seed-owner.ts";
export { createSettleSessionSecret } from "./verbs/settle-session-secret.ts";
