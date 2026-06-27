// `@orb/contracts/identity` — the ONE global-role axis + the two canonical identity shapes the auth
// seam threads (spine `identity-auth-permission.md` §1). DAG root: kit-only (the `UserId`/`Handle`/
// `ExternalId` brands from `@orb/kit/ids`) + zod. No domain, no `@orb/db`, no sibling contracts node.
//
// Identity is resolved ONCE at the entry seam into ONE immutable `Principal` that flows down unchanged;
// `ResolvedIdentity` is the pre-row VERIFICATION-tier output (NO `userId` by design — invariant #3),
// and the seam mints `Principal` from it once at `entry/auth/seam.ts`.

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { z } from "zod";

// The ONE global-authz axis — owner|admin|user (ledger D17; was the 2-member admin|user). The `owner`
// member is NEW: owner = the box owner (sole max-pro-sub/wallet holder; grants/revokes admin; immutable;
// EXACTLY ONE), admin = delegated administrator (NOT the box owner), user = normal. The single tuple is
// the one home (§7.4): the db `users.role` enum, the tRPC `z.enum`, the client form, and every gating
// domain DERIVE from it (no inline role-union re-spelling — `no-inline-union-redecl`).
export const USER_ROLES = ["owner", "admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** The wire schema for the role axis — `z.enum` over the canonical tuple (consumed by tRPC + forms). */
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * The VERIFICATION-tier output (`infra/auth`, sealed + db-free): identity resolved to its stable SSO
 * fields, BEFORE the `users` row exists. Carries NO `userId` by design (invariant #3 — infra must not
 * know row ids; the seam adds it when building `Principal`). `externalId` is the stable authentik
 * sub/uid (null for the single-user / owner-fallback path, which keys on `handle`); `groups` drives the
 * owner/admin role determination at the resolution tier.
 */
export interface ResolvedIdentity {
  externalId: ExternalId | null;
  handle: Handle;
  groups: string[];
}

/**
 * The post-seam, immutable, db-resolved caller — constructed ONCE at `entry/auth/seam.ts` and carried
 * downstream unchanged. `role` is the SOLE carried authz axis (no `groups`: SSO groups are consumed
 * into `role` at login — ledger §2). The CALLER is just `Principal.userId` (D19 — there is NO separate
 * `callerUserId` term, and NO `isOwner` field: owner⊇admin lives only inside the `can()` seam). The
 * turn concepts `triggeredBy`/`runAsUserId` are NOT on the Principal — they are per-turn ids.
 * `via` is the resolution-path discriminant: `"fallback"` is the SAFE "this IS the owner" marker (the
 * origin-gated belt) — NEVER `externalId === null` (a forward-header identity is also null).
 */
export interface Principal {
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";
}
