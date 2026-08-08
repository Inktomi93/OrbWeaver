// `single-user` — the locked zero-infra contract: no SSO, no cookies, no headers. The request resolves
// to the owner via the owner-fallback in `index.ts:resolve`, whose ORIGIN gate this mode never applies.
// So the resolver returns null — the fallback step takes over. The module exists to keep every mode the
// same shape (one module per mode) so the dispatcher's `Record` needs no special-case.
//
// "Unconditional" is about the ORIGIN, not the knob: `resolve` still requires `AUTH_FALLBACK=owner`, and
// since this fallback is single-user's ONLY credential, the `deny` pairing authenticates nobody and is
// boot-fatal in `foundation/env`.

import type { ResolvedIdentity } from "@orb/contracts/identity";

/** Always null: `single-user` delegates entirely to the unconditional owner fallback. */
export function resolveSingleUser(): Promise<ResolvedIdentity | null> {
  return Promise.resolve(null);
}
