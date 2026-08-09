// A5 — OpenID Connect Back-Channel Logout 1.0 `logout_token` VERIFY. Sealed infra crypto (jose), the same
// shape as jwks.ts's forward-header verify: signature against the issuer JWKS + the full spec claim
// checklist, fail-closed to null on ANY violation. The caller (entry/http/auth-routes) revokes every session
// row for the returned subject. Ours needs NO Redis — a re-delivered token just re-revokes (idempotent), so
// there is no jti replay cache to keep (OpenWebUI degrades to a no-op without Redis; we don't).
//
// The validation checklist mirrors OpenID Connect Back-Channel Logout 1.0 §2.4 (and OW oauth.py:2185-2239):
//   1. signature verifies against the issuer JWKS with a PINNED asymmetric alg (jose also blocks alg:none);
//   2. `iss` matches the configured issuer, `aud` contains our client_id (both enforced by jose jwtVerify);
//   3. `iat` is present;
//   4. the `events` claim carries the backchannel-logout member (as an object value);
//   5. the token carries NO `nonce` (its presence means an ID token was replayed as a logout token);
//   6. at least one of `sub` / `sid` is present.

import type { JWTPayload } from "jose";
import { jwtVerify } from "jose";
import { securityEvent } from "#foundation/observability";
import { jwksFor } from "./jwks.ts";

// The back-channel-logout event URI the `events` claim MUST carry (OIDC BCL §2.4).
const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
// The same asymmetric alg pin jwks.ts uses for forward-header verify: jose already blocks alg:none and
// key/alg-class confusion; pinning stops a future JWKS quirk widening what we accept (no RS256→HS256 downgrade).
const PINNED_ALGS = ["RS256", "ES256"] as const;

/** The subject a validated `logout_token` names — `sub` (the stable external id we key sessions on) and/or
 *  `sid`. At least one is non-null (§2.4). We revoke by `sub`; `sid` alone is validated but unactionable
 *  (we do not store a per-session IdP sid). */
export interface LogoutTokenSubject {
  readonly sub: string | null;
  readonly sid: string | null;
}

export interface BackchannelVerifyArgs {
  readonly logoutToken: string;
  /** The issuer JWKS — a URL (https, fetched + cached by {@link jwksFor}) at runtime, or a JWKS JSON literal
   *  (the `{…}` shape) in tests. Same dual-nature contract as `jwksFor`. */
  readonly jwks: string;
  readonly issuer: string;
  readonly audience: string;
}

export interface BackchannelLogoutVerifier {
  readonly verify: (args: BackchannelVerifyArgs) => Promise<LogoutTokenSubject | null>;
}

/** The `events` claim carries the back-channel-logout member as an object value (OIDC BCL §2.4). */
function hasBackchannelEvent(payload: JWTPayload): boolean {
  const events = payload["events"];
  if (events === null || typeof events !== "object") {
    return false;
  }
  return BACKCHANNEL_EVENT in (events as Record<string, unknown>);
}

/** Extract sub/sid; null when NEITHER is present (§2.4 requires at least one). */
function subjectFrom(payload: JWTPayload): LogoutTokenSubject | null {
  const rawSid = payload["sid"];
  const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  const sid = typeof rawSid === "string" && rawSid.length > 0 ? rawSid : null;
  if (sub === null && sid === null) {
    return null;
  }
  return { sub, sid };
}

/** The back-channel-logout verifier the entry route injects. Returns the validated subject, or null on ANY
 *  violation (bad signature / issuer / audience / missing iat / missing event / present nonce / no subject). */
export function createBackchannelLogoutVerifier(): BackchannelLogoutVerifier {
  return {
    verify: async ({ logoutToken, jwks, issuer, audience }: BackchannelVerifyArgs): Promise<LogoutTokenSubject | null> => {
      const keyset = jwksFor(jwks, []);
      if (keyset === null) {
        // jwksFor already emitted its own securityEvent for the rejection reason.
        return null;
      }
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(logoutToken, keyset, { algorithms: [...PINNED_ALGS], issuer, audience }));
      } catch {
        securityEvent(
          "oidc_backchannel_logout_rejected",
          { reason: "signature" },
          "security: OIDC back-channel logout_token failed signature / alg / issuer / audience verification — rejecting",
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
      if (typeof payload.iat !== "number") {
        securityEvent("oidc_backchannel_logout_rejected", { reason: "iat" }, "security: OIDC back-channel logout_token missing iat — rejecting");
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
