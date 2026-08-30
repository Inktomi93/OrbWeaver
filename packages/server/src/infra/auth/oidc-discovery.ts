// infra/auth/oidc-discovery — the SINGLE-FLIGHT issuer-discovery cache (#762, owner ruling 2026-08-30).
//
// Discovery is one unauthenticated HTTPS round-trip to the IdP's well-known document, memoized for the
// life of the process. It lives here rather than at `entry/lifecycle.ts` because it is external I/O with a
// concurrency CONTRACT that has to be provable: the composition root can wire it, but it cannot test it.
// Sealed-executor clean — no `@orb/db`, no domain, no `Configuration` construction (the caller injects the
// discover thunk, which is what makes the contract testable without an IdP).
//
// THE RULED CONTRACT (three clauses, all load-bearing):
//   1. ONE SHARED IN-FLIGHT PROMISE per cache. N concurrent cold callers join one discovery instead of
//      racing N. The old `cachedConfig ??= await discovery(…)` published nothing until it RESOLVED, so
//      every caller that arrived during the round-trip started its own — N sockets to the IdP on a cold
//      boot, N `Configuration` objects alive, and only one of them retained. That is a self-inflicted
//      burst against the one dependency an auth outage is worst on.
//   2. A REJECTION IS NEVER CACHED. Ownership is released on the failing attempt, so the next caller
//      retries. A poisoned cache would turn one transient DNS/TLS blip at boot into a permanently dead
//      login route with no signal — fail-closed is the RIGHT posture per request, but a fail-closed
//      LATCH is an outage.
//   3. A SETTLED SUCCESS IS CACHED FOREVER (the prior behaviour, unchanged). Rotating an IdP means
//      restarting the process, which is already true of every other `OIDC_*` env value.
//
// THE OWNERSHIP GUARD (`inFlight === attempt`) IS A BELT, STATED HONESTLY. Every joiner of one attempt
// releases ownership, so in principle a late release could clear a NEWER attempt some other caller had
// already published — orphaning it and letting the caller after that start a third discovery. On today's
// semantics that interleaving is unreachable: all joiners' releases run in the settling promise's own
// reaction batch, which drains before any observer of the rejection can call back in. The guard is kept
// anyway so the invariant is LOCAL to this function instead of resting on that microtask-ordering
// argument — it is deliberately not covered by a pin, because a pin for an unreachable branch cannot
// fail. Do not delete it on the grounds that no test names it.

import type { Configuration } from "openid-client";
import type { OidcDiscover } from "./contract.ts";

/**
 * Build the process-lifetime, single-flight OIDC discovery reader. The returned thunk is the `getConfig`
 * every OIDC route path calls; it resolves the memoized `Configuration`, joins the in-flight discovery, or
 * starts one — in that order.
 */
export function createOidcConfigCache(discover: OidcDiscover): () => Promise<Configuration> {
  /** The settled success. Set once; its presence is what makes clause 3 short-circuit before any await. */
  let settled: Configuration | undefined;
  /** The shared attempt, live only while a discovery is in flight (clause 1) and dropped on either
   *  outcome (clause 2 needs the rejection path; the success path is redundant with `settled` and released
   *  only so a resolved promise is not retained). */
  let inFlight: Promise<Configuration> | undefined;

  return async function getConfig(): Promise<Configuration> {
    if (settled !== undefined) {
      return settled;
    }
    // Publish the promise SYNCHRONOUSLY (before the first await) — that is the whole of clause 1. Every
    // caller that reaches this line during the round-trip finds the same attempt and joins it.
    inFlight ??= discover();
    const attempt = inFlight;
    try {
      const config = await attempt;
      settled = config;
      return config;
    } finally {
      // Release ownership of THIS attempt only (see the header's ownership-guard note). A rejection
      // therefore leaves no cached failure, and the next caller discovers again.
      if (inFlight === attempt) {
        inFlight = undefined;
      }
    }
  };
}
