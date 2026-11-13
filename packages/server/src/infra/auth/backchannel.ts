// A5 — OpenID Connect Back-Channel Logout 1.0 `logout_token` VERIFY. Sealed infra crypto (jose), the same
// shape as jwks.ts's forward-header verify: signature against the issuer JWKS + the full spec claim
// checklist, fail-closed to null on ANY violation. The caller (entry/http/auth-routes) revokes every session
// row for the returned subject.
//
// The validation checklist mirrors OpenID Connect Back-Channel Logout 1.0 §2.4 (and OW oauth.py:2185-2239):
//   1. signature verifies against the issuer JWKS with a PINNED asymmetric alg (jose also blocks alg:none);
//   2. `iss` matches the configured issuer, `aud` contains our client_id (both enforced by jose jwtVerify);
//   3. `iat`, `exp` and `jti` are present; native JOSE validates the numeric dates against the injected clock;
//   4. the `events` claim carries the backchannel-logout member (as an object value);
//   5. the token carries NO `nonce` (its presence means an ID token was replayed as a logout token);
//   6. at least one of `sub` / `sid` is present;
//   7. the `jti` was not accepted before (§2.6). Without this a captured token signs its subject out of every
//      session, a later one included, until `exp`.
//
// The replay record is process memory keyed by `jti` alone: jose pins one issuer, so ids cannot collide across
// issuers. An entry lives until its token's `exp`, after which jose refuses the token anyway, so the record holds
// at most the issuer's unexpired logout tokens. It is lost on restart, which reopens a replay window of at most one
// token lifetime; a persisted record is not worth a table for a sign-out-only harm.

import { OIDC_BACKCHANNEL_LOGOUT_EVENT } from "@orb/contracts/identity";
import type { Clock } from "@orb/kit/time";
import type { JWTPayload } from "jose";
import { errors, jwtVerify } from "jose";
import { z } from "zod";
import type { Logger } from "#foundation/observability";
import { securityEvent } from "#foundation/observability";
import type { BackchannelLogoutVerifier, BackchannelVerifyArgs, JwksReader, LogoutTokenSubject, VerifiedLogoutToken } from "./contract.ts";

// The same asymmetric alg pin jwks.ts uses for forward-header verify: jose already blocks alg:none and
// key/alg-class confusion; pinning stops a future JWKS quirk widening what we accept (no RS256→HS256 downgrade).
const PINNED_ALGS = ["RS256", "ES256"] as const;
const MS_PER_SECOND = 1000;
const REJECTED_EVENT = "oidc_backchannel_logout_rejected";

const backchannelEventsSchema = z.object({ [OIDC_BACKCHANNEL_LOGOUT_EVENT]: z.object({}).loose() });
const logoutTokenIdSchema = z.object({ jti: z.string(), exp: z.number() });
const logoutSubjectSchema = z.object({ sub: z.string().optional(), sid: z.string().optional() });

interface ClaimRejection {
  readonly reason: "nonce" | "jti" | "event" | "subject";
  readonly message: string;
}

/** The custom event is not a standard JWT claim; JOSE verifies the token, then this schema admits its meaning. */
function hasBackchannelEvent(payload: JWTPayload): boolean {
  return backchannelEventsSchema.safeParse(payload["events"]).success;
}

/** Extract sub/sid; null when NEITHER is present (§2.4 requires at least one). */
function subjectFrom(payload: JWTPayload): LogoutTokenSubject | null {
  const parsed = logoutSubjectSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const sub = parsed.data.sub === undefined || parsed.data.sub.length === 0 ? null : parsed.data.sub;
  const sid = parsed.data.sid === undefined || parsed.data.sid.length === 0 ? null : parsed.data.sid;
  return sub === null && sid === null ? null : { sub, sid };
}

// Checklist items 4–6 over a payload JOSE already verified.
function readClaims(payload: JWTPayload): VerifiedLogoutToken | ClaimRejection {
  // A logout_token MUST NOT carry a nonce (§2.4) — its presence means an ID token was replayed here.
  if (payload["nonce"] !== undefined) {
    return { reason: "nonce", message: "security: OIDC back-channel logout_token carried a nonce (an ID token replayed as a logout token) — rejecting" };
  }
  const id = logoutTokenIdSchema.safeParse(payload);
  if (!id.success) {
    return { reason: "jti", message: "security: OIDC back-channel logout_token has a malformed token id — rejecting" };
  }
  if (!hasBackchannelEvent(payload)) {
    return { reason: "event", message: "security: OIDC back-channel logout_token missing the backchannel-logout event — rejecting" };
  }
  const subject = subjectFrom(payload);
  if (subject === null) {
    return { reason: "subject", message: "security: OIDC back-channel logout_token carried neither sub nor sid — rejecting" };
  }
  return { ...subject, tokenId: id.data.jti, expiresAt: id.data.exp * MS_PER_SECOND };
}

/** The back-channel-logout verifier the entry route injects. Returns the validated token, or null on ANY
 *  violation (bad signature / issuer / audience / required claims / missing event / present nonce / no subject /
 *  an accepted token id). */
export function createBackchannelLogoutVerifier(readKeyset: JwksReader["jwksFor"], log: Logger, now: Clock): BackchannelLogoutVerifier {
  // Token id to its `exp` in epoch ms.
  const accepted = new Map<string, number>();
  const forgetExpired = (): void => {
    const at = now();
    for (const [tokenId, expiresAt] of accepted) {
      if (expiresAt <= at) {
        accepted.delete(tokenId);
      }
    }
  };
  return {
    verify: async ({ logoutToken, jwks, issuer, audience }: BackchannelVerifyArgs): Promise<VerifiedLogoutToken | null> => {
      const keyset = readKeyset(jwks);
      if (keyset === null) {
        // The key reader already emitted its own securityEvent for the rejection reason.
        return null;
      }
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(logoutToken, keyset, {
          algorithms: [...PINNED_ALGS],
          issuer,
          audience,
          requiredClaims: ["iat", "exp", "jti"],
          // One clock decides both `exp` and the replay record's expiry, so no instant exists where JOSE still
          // admits a token the record has already forgotten.
          currentDate: new Date(now()),
        }));
      } catch (error) {
        // jose raises every token, key-set and claim refusal as a JOSEError; anything else is a fault, not a refusal.
        if (!(error instanceof errors.JOSEError)) {
          throw error;
        }
        securityEvent(
          REJECTED_EVENT,
          { reason: "signature" },
          "security: OIDC back-channel logout_token failed signature / alg / issuer / audience / required-claim verification — rejecting",
          log,
        );
        return null;
      }
      const token = readClaims(payload);
      if ("reason" in token) {
        securityEvent(REJECTED_EVENT, { reason: token.reason }, token.message, log);
        return null;
      }
      forgetExpired();
      if (accepted.has(token.tokenId)) {
        securityEvent(REJECTED_EVENT, { reason: "replay" }, "security: OIDC back-channel logout_token id was already accepted — rejecting the replay", log);
        return null;
      }
      return token;
    },
    accept: (token: VerifiedLogoutToken): void => {
      forgetExpired();
      accepted.set(token.tokenId, token.expiresAt);
    },
  };
}

export type { BackchannelLogoutVerifier } from "./contract.ts";
