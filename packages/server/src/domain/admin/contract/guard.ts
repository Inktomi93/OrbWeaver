// domain/admin/contract/guard — the TYPED GUARD SEAM surface. These are the op shapes the OTHER domains
// inject (type-only) to gate their privileged surfaces — settings injects `RequireAdmin`, credentials
// injects `RequireOwner`, transport mirrors `can()` (admin.md §"admin as a provider"; identity-auth-
// permission §6). A leaf declares the SHAPE here and receives the runtime op at the composition root, so
// it never sideways-imports admin's `guard.ts` impl (the `domain-no-cross-feature` ban — type-only is the
// sanctioned cross-feature edge). The IMPL lives in `domain/admin/guard.ts`.
//
// Authorization is per-call on the Principal the caller is handed — `role` is fresh per request (sessions'
// job); the guard NEVER re-queries identity and NEVER caches a decision onto the Principal (spine §1).

import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";

// The global-scope authority actions `can()` arbitrates today — the canonical `as const` tuple is the one
// home for this axis (§7.5; derive, don't re-spell). `admin` = "requires an administrator" (owner ∪ admin
// pass — owner ⊇ admin lives ONLY in the seam); `owner` = "requires the box owner" (owner-only). The
// resource-role actions (`read`/`host`, D18) land with chat and grow the same seam — they are NOT here yet.
export const GLOBAL_ACTIONS = ["admin", "owner"] as const;
export type GlobalAction = (typeof GLOBAL_ACTIONS)[number];

// The resource a privilege decision is scoped to. GLOBAL is all admin owns today (the global-role axis);
// the resource-role arms (`{ kind: 'chat', roster }` / `{ kind: 'character', … }`, D18) are CHAT's build
// and EXTEND this union — at which point `can()`'s `resource.kind satisfies "global"` breaks `tsc` until
// the new arm is handled (born-compliant exhaustiveness).
// FLAG[PD-1] (judged, not silently chosen): when the resource-role axis lands, `ResourceRef` + the `Can` op type
// are cross-boundary (admin arbitrates, chat calls in with a roster chat owns) and should be PROMOTED to
// `@orb/contracts` — chat cannot write admin's contract to add its arm. Global-only-in-admin is correct +
// sufficient for the W1 unblock (leaves inject `RequireAdmin`/`RequireOwner`, which are global).
export interface GlobalResource {
  readonly kind: "global";
}
export type ResourceRef = GlobalResource;

/** The ONE privilege-decision primitive: throws `DomainForbiddenError` on deny, returns void on allow.
 *  Every gate routes through this — the only role-comparison site in the codebase (spine invariant #6). */
export type Can = (principal: Principal, action: GlobalAction, resource: ResourceRef) => void;

/** `can(p, 'admin', global)` — passes for owner ∪ admin. Returns the gated `userId` (chainable) or throws.
 *  The verb-tier half of the 2-layer global-role gate (transport `adminMiddleware` is the other half). */
export type RequireAdmin = (principal: Principal) => UserId;

/** `can(p, 'owner', global)` — owner-only. Gates the box-credential mint, admin grant/revoke, and the
 *  owner-only surfaces (D17). Returns the gated `userId` (chainable) or throws `DomainForbiddenError`. */
export type RequireOwner = (principal: Principal) => UserId;
