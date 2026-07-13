// domain/sessions — FRONT DOOR: the only legal external import. Cross-boundary types are re-exported
// type-only; their canonical home is @orb/contracts.

export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
export type { SessionView } from "@orb/contracts/session";
export type { SessionsService } from "./contract/service";
export type { ViewerView } from "./contract/views";
export { createOidcStore } from "./persistence/oidc-store";
export { createSessionsService } from "./service";
// Exported so entry's boot owner-seed and the login-derived role path can never fork.
export { ownerHandles } from "./substrate/role-policy";
export { createTokenHasher } from "./tokens/tokens";
