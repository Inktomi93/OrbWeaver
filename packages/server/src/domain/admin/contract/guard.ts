// domain/admin/contract/guard — the global-role guard wrapper types admin owns (RequireAdmin/RequireOwner).
// A leaf declares the shape here and receives the runtime op at the composition root, never sideways-
// importing admin's guard.ts impl (whose implementation lives there). Authorization is per-call on the
// Principal handed in — the guard never re-queries identity or caches a decision onto it.

import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";

/** owner ∪ admin gate. Returns the gated userId (chainable) or throws. */
export type RequireAdmin = (principal: Principal) => UserId;

/** Owner-only gate. Returns the gated userId (chainable) or throws DomainForbiddenError. */
export type RequireOwner = (principal: Principal) => UserId;

/** Boolean form of the owner∪admin gate, for role-aware scoping where a throw would be control flow. */
export type IsAdmin = (principal: Principal) => boolean;
