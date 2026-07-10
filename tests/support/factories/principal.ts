// support/factories/principal — the resolved-identity `Principal` every authz-gated verb test threads
// (contracts/identity §1: identity is resolved ONCE at the entry seam into one immutable Principal). NOT a
// db builder — a Principal is the pre-row VERIFICATION output the seam already minted, so this is a pure
// value factory (no `make`/`seed` prefix: it neither persists nor participates in the FK chain). ~25 verb
// `_support.ts` files hand-rolled the same `{userId, role:"user", handle, externalId:null, via:"cookie"}`
// literal; the observed variants (a `role` param in the guard tests, `handle`-echoes-`userId` in invites)
// are both reachable through `overrides`.

import type { Principal } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** A cookie-resolved `Principal` for `userId`. Defaults: `role:"user"`, `handle` echoes the id,
 *  `externalId:null`, `via:"cookie"` — override any axis (role for the guard matrix, handle where the
 *  test asserts on it, `via`/`externalId` for the header/fallback paths). */
export function principal(userId: UserId, overrides: Partial<Principal> = {}): Principal {
  return {
    userId,
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null as ExternalId | null,
    via: "cookie",
    ...overrides,
  };
}
