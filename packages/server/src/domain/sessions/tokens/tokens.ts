import { createHmac } from "node:crypto";

// domain/sessions/tokens — the named token-crypto + timing subsystem (D38: RELOCATED here from
// `infra/crypto/token-hash.ts` — token crypto is this domain's, so the orchestrator removed the
// `infra/crypto` copy + its barrel export). Pure crypto + constants; NO db.
//
// The pepper (`SESSION_SECRET`) is INJECTED, not read here: `entry/` constructs the hasher with
// `createTokenHasher(env.SESSION_SECRET)` (the value flows DOWN from `foundation/env`) and threads the
// bound `hashToken` through `SessionsContext`. This mirrors the project's `SecretBox`/key DI idiom — and
// it is what makes the "missing-secret throws" branch reachable in a test (a frozen-env read could
// never exercise the disabled branch). The token's HASH is stored, never the token: an HMAC-peppered
// digest means a DB leak ALONE cannot forge a session (the stored hash is useless without the pepper).

const HMAC_ALGORITHM = "sha256";

// 30-day sliding window. The slide WRITE is throttled (only past SLIDE_THROTTLE_MS) so an authenticated
// request burst doesn't write on every call; the revoked/expired/enabled CHECKS still run EVERY request
// (that is what makes logout/disable take effect on the very next request, not at TTL).
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SESSION_TTL_DAYS = 30;
const SLIDE_THROTTLE_MINUTES = 5;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE;
export const SLIDE_THROTTLE_MS = SLIDE_THROTTLE_MINUTES * MS_PER_MINUTE;

/**
 * Build the bound, peppered token hasher. Returns a `hashToken(token) → hex` closure over the pepper;
 * it THROWS (loud misconfiguration beats silent forgery) if the pepper is unset/empty — the earlier
 * `?? ""` floor would HMAC the empty string for a future non-cookie caller. Sessions exist only in
 * `oidc`/`local` modes, both of which env-refine `SESSION_SECRET` as required, so the throw is unreachable
 * in a correct deploy — it guards future call sites (the token is never stored, only its peppered hash).
 */
export function createTokenHasher(pepper: string | null | undefined): (token: string) => string {
  const key = pepper !== null && pepper !== undefined && pepper.length > 0 ? pepper : null;
  return (token: string): string => {
    if (key === null) {
      throw new Error(
        "SESSION_SECRET is not configured but is required for session token hashing. " +
          "Set SESSION_SECRET in the deployment env.",
      );
    }
    return createHmac(HMAC_ALGORITHM, key).update(token).digest("hex");
  };
}
