// `single-user` — the locked zero-infra contract: no SSO, no cookies, no headers. The request resolves to
// the owner via the owner-fallback in `index.ts:resolve`. So the resolver returns null — the fallback step
// takes over. The module exists to keep every mode the same shape (one module per mode) so the
// dispatcher's `Record` needs no special-case.
//
// NOTHING here is unconditional (corrected 2026-08-19, #298 f2 — this header used to claim the fallback's
// ORIGIN gate "this mode never applies"). `resolve` requires BOTH `AUTH_FALLBACK=owner` AND a LOOPBACK TCP
// peer (`ownerFallbackAllowed`, dispatch.ts) — ONE rule for every mode, single-user included — so a
// non-loopback caller in this mode authenticates NOBODY and 401s. And since the fallback is single-user's
// ONLY credential, the `deny` pairing authenticates nobody either and is boot-fatal in `foundation/env`.

import type { ResolvedIdentity } from "@orb/contracts/identity";

/** Always null: `single-user` delegates entirely to the loopback-peer-gated owner fallback. */
export function resolveSingleUser(): Promise<ResolvedIdentity | null> {
  return Promise.resolve(null);
}
