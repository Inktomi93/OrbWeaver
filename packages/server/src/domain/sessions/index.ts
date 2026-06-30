// domain/sessions — FRONT DOOR: the only legal external import. The seam (`entry/auth/seam.ts`) consumes
// validate/provisionIdentity/ensureUser to mint the one `Principal`; `admin` consumes a slice via an
// injected `SessionAdminPort`. Cross-boundary types are re-exported type-only — their canonical home is
// `@orb/contracts` (never re-declared here, §7.4).

export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
export type { SessionView } from "@orb/contracts/session";
export type { SessionsService } from "./contract/service";
export { createSessionsService } from "./service";
// The token-hashing primitive the composition root binds for any token-bearing producer (sessions hashes
// session tokens with it internally; chat's invite-token `hashToken` dep is the same pepper+HMAC). Surfaced
// on the front door so `entry/` can wire it without a deep import (domain-feature-front-door).
export { createTokenHasher } from "./tokens/tokens";
