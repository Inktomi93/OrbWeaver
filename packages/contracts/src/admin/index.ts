// @orb/contracts/admin — the global-role guard shapes admin implements and sibling domains receive as injected ops.
// Authorization is per-call on the Principal handed in: the guard never re-queries identity or caches a decision onto it.

import type { UserId } from "@orb/kit/ids";
import type { Principal } from "#identity";

/** owner ∪ admin gate. Returns the gated userId (chainable) or throws. */
export type RequireAdmin = (principal: Principal) => UserId;

/** Owner-only gate. Returns the gated userId (chainable) or throws DomainForbiddenError. */
export type RequireOwner = (principal: Principal) => UserId;

/** Boolean form of the owner∪admin gate, for role-aware scoping where a throw would be control flow. */
export type IsAdmin = (principal: Principal) => boolean;

/** Boolean form of the OWNER-only gate — one rung narrower than {@link IsAdmin}, for a gate that must answer
 *  true/false rather than throw (the /api/_debug admission arm). */
export type IsOwner = (principal: Principal) => boolean;
