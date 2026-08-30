import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { SessionToken } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";

// domain/sessions/tokens — token-crypto + timing subsystem. Pure crypto + constants, no db. The pepper
// (SESSION_SECRET) is injected, not read here, so entry/ threads the bound hashToken through SessionsContext.
// The token's hash is stored, never the token: an HMAC-peppered digest means a DB leak alone can't forge a
// session.
//
// It also derives the OIDC id_token cipher key (#141) — the SAME `SESSION_SECRET`, a DIFFERENT purpose.
// That lives here, beside the hasher, for the D38 reason the hasher itself lives here: keying material
// derived from SESSION_SECRET is a sessions-resolution concern, not `infra/crypto`'s (infra owns the
// CIPHER; this subsystem owns which key each session purpose gets).

const HMAC_ALGORITHM = "sha256";
const RANDOM_TOKEN_BYTES = 32;
// AES-256 needs exactly 32 bytes; `SESSION_SECRET` is an operator-supplied string of any length, so it is
// stretched rather than used raw.
const ID_TOKEN_KEY_BYTES = 32;
// DOMAIN SEPARATION, and the whole reason this is HKDF rather than a hash of the secret. The token hasher
// uses SESSION_SECRET as an HMAC key; this uses it as HKDF input keying material under a purpose label, so
// the two keys are computationally unrelated and neither construction leaks anything about the other. The
// label is a WIRE CONSTANT in the sense that matters: change it and every id_token already at rest becomes
// undecryptable (a degraded logout, never a broken session — see `verbs/revoke`).
const ID_TOKEN_KEY_INFO = "orb/sessions/oidc-id-token/v1";
// HKDF's salt is optional and public by definition; a hardcoded constant would add nothing a constant
// `info` label does not already provide, so extract runs with the spec's zero-length salt.
const ID_TOKEN_KEY_SALT = "";

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

/**
 * #141 — the AES-256-GCM box the OIDC `id_token` is sealed into at rest, keyed by HKDF-SHA256 over the
 * SAME `SESSION_SECRET` the token hasher peppers with (owner ruling 2026-08-30: reuse the existing secret,
 * mint no new one) under this subsystem's own purpose label.
 *
 * DISABLED WHEN THE PEPPER IS ABSENT, exactly like {@link createTokenHasher}: `createSecretBox(null)`
 * throws at CALL time, never at boot. That arm is unreachable in production — an unset `SESSION_SECRET`
 * already makes `hashToken` throw before any session row can be written, so there is no state where a
 * session exists but its id_token could not be sealed — and it exists so a misconfigured box degrades the
 * same way everywhere instead of failing boot in a new place.
 *
 * The AAD is NOT derived here: the caller binds it (`context.ts` supplies the session ROW id on both
 * seal and open, one site each) the way `domain/credentials` supplies `${userId}|${provider}`.
 */
export function createIdTokenBox(pepper: string | null | undefined): SecretBox {
  if (pepper === null || pepper === undefined || pepper.length === 0) {
    return createSecretBox(null);
  }
  return createSecretBox(Buffer.from(hkdfSync(HMAC_ALGORITHM, pepper, ID_TOKEN_KEY_SALT, ID_TOKEN_KEY_INFO, ID_TOKEN_KEY_BYTES)));
}
