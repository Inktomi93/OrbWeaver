import { createHmac, randomBytes } from "node:crypto";
import type { SessionToken } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// domain/sessions/tokens — token-crypto + timing subsystem. Pure crypto + constants, no db. The pepper
// (SESSION_SECRET) is injected, not read here, so entry/ threads the bound hashToken through SessionsContext.
// The token's hash is stored, never the token: an HMAC-peppered digest means a DB leak alone can't forge a
// session.

const HMAC_ALGORITHM = "sha256";
const RANDOM_TOKEN_BYTES = 32;

// 30-day sliding window. The slide write is throttled so a request burst doesn't write every call; the
// revoked/expired/enabled checks still run every request (logout/disable take effect next request, not TTL).
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SESSION_TTL_DAYS = 30;
const SLIDE_THROTTLE_MINUTES = 5;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * MS_PER_MINUTE;
export const SLIDE_THROTTLE_MS = SLIDE_THROTTLE_MINUTES * MS_PER_MINUTE;

/** THE session-token mint — the one site a `SessionToken` comes into existence (256 bits of CSPRNG entropy,
 *  base64url so it is cookie-safe verbatim). The brand is applied HERE rather than at the verb so no other
 *  module can conjure one: `castId` is the sanctioned cast, and the value it brands is a freshly generated
 *  opaque secret, never a re-used string from elsewhere. */
export function mintSessionToken(): SessionToken {
  return castId<SessionToken>(randomBytes(RANDOM_TOKEN_BYTES).toString("base64url"));
}

/** Build the bound, peppered token hasher; throws if the pepper is unset/empty (loud misconfiguration beats
 *  silent forgery). Deliberately generic over `string`: chat's INVITE tokens share this primitive
 *  (`entry/compose/chat.ts` binds it into `ChatContext.hashToken`), and an invite token is not a
 *  `SessionToken`. The session-side narrowing lives on `SessionsContext.hashToken`. */
export function createTokenHasher(pepper: string | null | undefined): (token: string) => string {
  const key = pepper !== null && pepper !== undefined && pepper.length > 0 ? pepper : null;
  return (token: string): string => {
    if (key === null) {
      throw new Error("SESSION_SECRET is not configured but is required for session token hashing. Set SESSION_SECRET in the deployment env.");
    }
    return createHmac(HMAC_ALGORITHM, key).update(token).digest("hex");
  };
}
