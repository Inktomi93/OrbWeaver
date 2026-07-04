// domain/sessions — FRONT DOOR: the only legal external import. The seam (`entry/auth/seam.ts`) consumes
// validate/provisionIdentity/ensureUser to mint the one `Principal`; `admin` consumes a slice via an
// injected `SessionAdminPort`. Cross-boundary types are re-exported type-only — their canonical home is
// `@orb/contracts` (never re-declared here, §7.4).

export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
export type { SessionView } from "@orb/contracts/session";
export type { SessionsService } from "./contract/service";
export { createOidcStore } from "./persistence/oidc-store";
export { createSessionsService } from "./service";
// The ONE owner-handle predicate (D17 role policy) — exported so entry's boot owner-seed and the
// login-derived role path can never fork (PD-98: entry must call this, not re-implement the comma-split).
export { ownerHandles } from "./substrate/role-policy";
export { createTokenHasher } from "./tokens/tokens";
