// domain/admin/contract/guard — the GLOBAL-role guard wrapper types admin owns (`RequireAdmin`/`RequireOwner`).
//
// PD-1 — RESOLVED (P5, chat wired the `host|member` resource axis). The `can()` seam types (`Can`/`ResourceRef`
// + the chat-resource arm + the action vocab) PROMOTED to `@orb/contracts/identity`: they are cross-boundary
// (admin's `can()` arbitrates; chat — which cannot write admin's contract, `domain-no-cross-feature` — calls in
// with a roster it loaded), so they home at the DAG root where BOTH sides import DOWN. Import them from
// `@orb/contracts/identity` (admin re-exports `Can`/`ResourceRef`/`GlobalAction` from its front door for
// ergonomics). `RequireAdmin`/`RequireOwner` STAY here: they are admin's GLOBAL wrappers (settings injects
// `RequireAdmin`, credentials injects `RequireOwner`); a leaf declares the SHAPE here and receives the runtime
// op at the composition root, so it never sideways-imports admin's `guard.ts` impl. The IMPL of all three lives
// in `domain/admin/guard.ts`.
//
// Authorization is per-call on the Principal the caller is handed — `role` is fresh per request (sessions'
// job); the guard NEVER re-queries identity and NEVER caches a decision onto the Principal (spine §1).

import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";

/** `can(p, 'admin', global)` — passes for owner ∪ admin. Returns the gated `userId` (chainable) or throws.
 *  The verb-tier half of the 2-layer global-role gate (transport `adminMiddleware` is the other half). */
export type RequireAdmin = (principal: Principal) => UserId;

/** `can(p, 'owner', global)` — owner-only. Gates the box-credential mint, admin grant/revoke, and the
 *  owner-only surfaces (D17). Returns the gated `userId` (chainable) or throws `DomainForbiddenError`. */
export type RequireOwner = (principal: Principal) => UserId;
