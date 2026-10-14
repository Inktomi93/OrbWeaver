// A5 — OpenID Connect Back-Channel Logout 1.0 `logout_token` VERIFY. Sealed infra crypto (jose), the same
// shape as jwks.ts's forward-header verify: signature against the issuer JWKS + the full spec claim
// checklist, fail-closed to null on ANY violation. The caller (entry/http/auth-routes) revokes every session
// row for the returned subject. Ours needs NO Redis — a re-delivered token just re-revokes (idempotent), so
// there is no jti replay cache to keep (OpenWebUI degrades to a no-op without Redis; we don't).
//
// The validation checklist mirrors OpenID Connect Back-Channel Logout 1.0 §2.4 (and OW oauth.py:2185-2239):
//   1. signature verifies against the issuer JWKS with a PINNED asymmetric alg (jose also blocks alg:none);
//   2. `iss` matches the configured issuer, `aud` contains our client_id (both enforced by jose jwtVerify);
//   3. `iat`, `exp` and `jti` are present; native JOSE validates the numeric dates;
//   4. the `events` claim carries the backchannel-logout member (as an object value);
//   5. the token carries NO `nonce` (its presence means an ID token was replayed as a logout token);
//   6. at least one of `sub` / `sid` is present.

import type { JWTPayload } from "jose";
import { jwtVerify } from "jose";
import { z } from "zod";
import { securityEvent } from "#foundation/observability";
import type { JwksReader } from "./contract.ts";
import { jwksFor } from "./jwks.ts";

// The back-channel-logout event URI the `events` claim MUST carry (OIDC BCL §2.4).
const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
// The same asymmetric alg pin jwks.ts uses for forward-header verify: jose already blocks alg:none and
// key/alg-class confusion; pinning stops a future JWKS quirk widening what we accept (no RS256→HS256 downgrade).
const PINNED_ALGS = ["RS256", "ES256"] as const;

// @orb-waive no-inline-package-interface(LogoutTokenSubject): baselined when the gate landed; burn-down item 952.
/** The subject a validated `logout_token` names — `sub` (the stable external id we key sessions on) and/or
 *  `sid`. At least one is non-null (§2.4). We revoke by `sub`; `sid` alone is validated but unactionable
 *  (we do not store a per-session IdP sid). */
export interface LogoutTokenSubject {
  readonly sub: string | null;
  readonly sid: string | null;
}

// @orb-waive no-inline-package-interface(BackchannelVerifyArgs): baselined when the gate landed; burn-down item 952.
export interface BackchannelVerifyArgs {
  readonly logoutToken: string;
  /** The issuer JWKS — a URL (https, fetched + cached by {@link jwksFor}) at runtime, or a JWKS JSON literal
   *  (the `{…}` shape) in tests. Same dual-nature contract as `jwksFor`. */
  readonly jwks: string;
  readonly issuer: string;
  readonly audience: string;
}

// @orb-waive no-inline-package-interface(BackchannelLogoutVerifier): baselined when the gate landed; burn-down item 952.
export interface BackchannelLogoutVerifier {
  readonly verify: (args: BackchannelVerifyArgs) => Promise<LogoutTokenSubject | null>;
}

const backchannelEventsSchema = z.object({ [BACKCHANNEL_EVENT]: z.object({}).loose() });
const logoutTokenIdSchema = z.string();
const logoutSubjectSchema = z.object({ sub: z.string().optional(), sid: z.string().optional() });

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

/** The back-channel-logout verifier the entry route injects. Returns the validated subject, or null on ANY
 *  violation (bad signature / issuer / audience / required claims / missing event / present nonce / no subject). */
export function createBackchannelLogoutVerifier(readKeyset: JwksReader["jwksFor"] = jwksFor): BackchannelLogoutVerifier {
  return {
    verify: async ({ logoutToken, jwks, issuer, audience }: BackchannelVerifyArgs): Promise<LogoutTokenSubject | null> => {
      const keyset = readKeyset(jwks, []);
      if (keyset === null) {
        // jwksFor already emitted its own securityEvent for the rejection reason.
        return null;
      }
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(logoutToken, keyset, { algorithms: [...PINNED_ALGS], issuer, audience, requiredClaims: ["iat", "exp", "jti"] }));
      } catch {
        securityEvent(
          "oidc_backchannel_logout_rejected",
          { reason: "signature" },
          "security: OIDC back-channel logout_token failed signature / alg / issuer / audience / required-claim verification — rejecting",
        );
        return null;
      }
      // A logout_token MUST NOT carry a nonce (§2.4) — its presence means an ID token was replayed here.
      if (payload["nonce"] !== undefined) {
        securityEvent(
          "oidc_backchannel_logout_rejected",
          { reason: "nonce" },
          "security: OIDC back-channel logout_token carried a nonce (an ID token replayed as a logout token) — rejecting",
        );
        return null;
      }
      if (!logoutTokenIdSchema.safeParse(payload.jti).success) {
        securityEvent("oidc_backchannel_logout_rejected", { reason: "jti" }, "security: OIDC back-channel logout_token has a malformed token id — rejecting");
        return null;
      }
      if (!hasBackchannelEvent(payload)) {
        securityEvent(
          "oidc_backchannel_logout_rejected",
          { reason: "event" },
          "security: OIDC back-channel logout_token missing the backchannel-logout event — rejecting",
        );
        return null;
      }
      const subject = subjectFrom(payload);
      if (subject === null) {
        securityEvent(
          "oidc_backchannel_logout_rejected",
          { reason: "subject" },
          "security: OIDC back-channel logout_token carried neither sub nor sid — rejecting",
        );
        return null;
      }
      return subject;
    },
  };
}
