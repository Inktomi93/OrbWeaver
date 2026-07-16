// The auth mint routes + cookie I/O. This is the write side of the __Host-orb_session cookie (the read
// side is the seam + infra/auth). Never re-implements identity resolution: mints sessions via
// domain/sessions and writes the cookie; resolution belongs to the seam.
//
// Local login: password-form → verify (injected `authenticate` port) → sessions.create → set cookie.
// Registered only when the op is provided (fail-closed in non-local modes).
//
// OIDC login: openid-client v6 flow — discovery → PKCE + state + nonce → buildAuthorizationUrl (redirect)
// → callback: consume the PKCE txn → authorizationCodeGrant → claims → provisionIdentity → mint cookie.
// Registered only when `OidcRoutesDeps` is supplied.
//
// Origin-flexible callback: the redirect_uri is derived per-request from the origin and accepted only if
// it exact-matches the OIDC_REDIRECT_URIS allowlist — never reflects an attacker-supplied origin
// (open-redirect class). The validated redirect_uri is stored in the transaction and reconstructed at the
// callback so the token exchange presents the same redirect_uri the IdP saw, even behind a proxy.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { Configuration } from "openid-client";
import { authorizationCodeGrant, buildAuthorizationUrl, calculatePKCECodeChallenge, randomNonce, randomPKCECodeVerifier, randomState } from "openid-client";
import { securityEvent } from "#foundation/observability";
import type { OidcTransaction } from "#infra/auth";
import { SESSION_COOKIE_NAME } from "#infra/auth";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const NO_CONTENT = 204;
const FOUND = 302;
const MS_PER_SECOND = 1000;
const PKCE_METHOD = "S256";
// `__Host-` requires these three (Secure + Path=/ + no Domain); SameSite=Lax + HttpOnly complete the policy.
const COOKIE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";

const LOGIN_ROUTE = "/api/auth/login";
const LOGOUT_ROUTE = "/api/auth/logout";
const OIDC_LOGIN_ROUTE = "/api/auth/oidc/login";
const OIDC_CALLBACK_ROUTE = "/api/auth/oidc/callback";
const HANDLE_FIELD = "handle";
const PASSWORD_FIELD = "password";

/** Serialize the `__Host-orb_session` Set-Cookie value with a Max-Age (seconds; clamped ≥ 0). */
export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAge}; ${COOKIE_ATTRS}`;
}

/** Serialize the cleared (logout) Set-Cookie value — same name + attrs, empty value, Max-Age=0. */
export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRS}`;
}

/** Read the opaque session token from the request `Cookie` header, or `null`. */
function readSessionToken(headers: Headers): string | null {
  const raw = headers.get("cookie");
  if (raw === null) {
    return null;
  }
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The `domain/sessions` slice the mint routes consume (the seam owns resolution; this is the write side). */
export interface AuthSessionsPort {
  readonly create: (params: { readonly userId: UserId; readonly userAgent?: string | null }) => Promise<{ readonly token: string; readonly expiresAt: number }>;
  readonly revokeByToken: (token: string) => Promise<void>;
  readonly provisionIdentity: (identity: ResolvedIdentity) => Promise<ProvisionOutcome>;
}

/** The `provisionIdentity` result the OIDC callback dispatches on: `provisioned` (mint the session,
 *  gating on `enabled`) or `denied` (the login gate refused — 401, no session). */
type ProvisionOutcome =
  | {
      readonly outcome: "provisioned";
      readonly userId: UserId;
      readonly enabled: boolean;
      readonly role: UserRole;
    }
  | { readonly outcome: "denied" };

/** Local password verification, supplied from `sessions.authenticate` by the composition root in local mode. */
export interface LocalAuthenticator {
  // biome-ignore lint/style/useShorthandFunctionType: the shorthand `export type X = (...) => ...` alias trips the no-inline-types rule's broad `export type` arm (entry/ is not a contract type home), so keep the call-signature interface and suppress the biome INFO instead.
  (handle: string, password: string): Promise<UserId | null>;
}

/** The OIDC transaction store the route needs — mint (authorize) + consume (callback). Wider than
 *  infra/auth's consume-only store because the authorize-redirect route also mints. */
export interface OidcMintStore {
  readonly mint: (tx: OidcTransaction) => Promise<void>;
  readonly consume: (state: string) => Promise<OidcTransaction | null>;
}

/** The OIDC claim-name mapping, provider-agnostic. Any name may be a dot-path for a nested claim. */
export interface OidcClaimMap {
  readonly usernameClaim: string;
  readonly uidClaim: string;
  readonly groupsClaim: string;
  readonly emailClaim: string;
}

export interface OidcRoutesDeps {
  readonly getConfig: () => Promise<Configuration>;
  /** Empty ⇒ every login 400s (fail-closed: no origin is permitted). */
  readonly redirectAllowlist: readonly string[];
  readonly scope: string;
  readonly claims: OidcClaimMap;
  readonly store: OidcMintStore;
}

export interface AuthRoutesDeps {
  readonly sessions: AuthSessionsPort;
  readonly now: () => number;
  readonly authenticate?: LocalAuthenticator;
  readonly oidc?: OidcRoutesDeps;
}

/** Register the auth mint routes on `app`. Logout is always present; local login / OIDC are registered
 *  only when their injected op is supplied. */
export function registerAuthRoutes(app: Hono, deps: AuthRoutesDeps): void {
  const authenticate = deps.authenticate;
  if (authenticate !== undefined) {
    app.post(LOGIN_ROUTE, async (c) => {
      const body = await c.req.parseBody();
      const handle = typeof body[HANDLE_FIELD] === "string" ? body[HANDLE_FIELD] : "";
      const password = typeof body[PASSWORD_FIELD] === "string" ? body[PASSWORD_FIELD] : "";
      if (handle.length === 0 || password.length === 0) {
        return c.json({ error: "missing credentials" }, BAD_REQUEST);
      }
      const userId = await authenticate(handle, password);
      if (userId === null) {
        return c.json({ error: "invalid credentials" }, UNAUTHORIZED);
      }
      const session = await deps.sessions.create({
        userId,
        userAgent: c.req.header("user-agent") ?? null,
      });
      c.header("Set-Cookie", sessionCookieFor(session, deps.now()));
      return c.json({ ok: true });
    });
  }

  app.post(LOGOUT_ROUTE, async (c) => {
    const token = readSessionToken(c.req.raw.headers);
    if (token !== null) {
      await deps.sessions.revokeByToken(token);
    }
    c.header("Set-Cookie", serializeClearedSessionCookie());
    return c.body(null, NO_CONTENT);
  });

  const oidc = deps.oidc;
  if (oidc !== undefined) {
    registerOidcRoutes(app, deps, oidc);
  }
}

/** Build the Set-Cookie for a freshly minted session (Max-Age from the expiry minus the injected clock). */
function sessionCookieFor(session: { readonly token: string; readonly expiresAt: number }, now: number): string {
  return serializeSessionCookie(session.token, (session.expiresAt - now) / MS_PER_SECOND);
}

/**
 * Derive the OIDC callback redirect_uri from the request origin and accept it only when it exact-matches
 * the allowlist — never reflect an attacker-supplied origin blindly. Proto defaults to `https` and is
 * never downgraded on an unknown origin (a plain-HTTP deploy with no X-Forwarded-Proto 400s by design).
 * X-Forwarded-Host is trusted here because the allowlist is the real gate. Off-allowlist ⇒ null.
 */
export function deriveRedirectUri(headers: Headers, allowlist: readonly string[]): string | null {
  const rawProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = rawProto !== undefined && rawProto !== "" ? rawProto : "https";
  const rawHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = rawHost !== undefined && rawHost !== "" ? rawHost : headers.get("host");
  if (host === null || host.length === 0) {
    return null;
  }
  const candidate = `${proto}://${host}${OIDC_CALLBACK_ROUTE}`;
  return allowlist.includes(candidate) ? candidate : null;
}

/** The OIDC authorize-redirect + callback handlers (openid-client v6). */
function registerOidcRoutes(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps): void {
  app.get(OIDC_LOGIN_ROUTE, async (c) => {
    const redirectUri = deriveRedirectUri(c.req.raw.headers, oidc.redirectAllowlist);
    if (redirectUri === null) {
      securityEvent(
        "oidc_redirect_uri_rejected",
        {
          proto: c.req.raw.headers.get("x-forwarded-proto"),
          host: c.req.raw.headers.get("x-forwarded-host") ?? c.req.raw.headers.get("host"),
          allowlistSize: oidc.redirectAllowlist.length,
        },
        "security: OIDC login origin not in OIDC_REDIRECT_URIS allowlist — rejecting (no transaction minted)",
      );
      return c.json({ error: "This origin is not an allowed OIDC callback." }, BAD_REQUEST);
    }
    const config = await oidc.getConfig();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();
    const nonce = randomNonce();
    await oidc.store.mint({
      state,
      codeVerifier,
      nonce,
      redirectUri,
      createdAt: deps.now(),
    });
    const url = buildAuthorizationUrl(config, {
      // biome-ignore lint/style/useNamingConvention: OAuth/OIDC authorization-request parameter names are wire-fixed (snake_case).
      redirect_uri: redirectUri,
      scope: oidc.scope,
      // biome-ignore lint/style/useNamingConvention: OAuth/OIDC authorization-request parameter names are wire-fixed (snake_case).
      code_challenge: codeChallenge,
      // biome-ignore lint/style/useNamingConvention: OAuth/OIDC authorization-request parameter names are wire-fixed (snake_case).
      code_challenge_method: PKCE_METHOD,
      state,
      nonce,
    });
    return c.redirect(url.href, FOUND);
  });

  app.get(OIDC_CALLBACK_ROUTE, async (c) => {
    const incoming = new URL(c.req.url);
    const tx = await oidc.store.consume(incoming.searchParams.get("state") ?? "");
    if (tx === null) {
      return c.json({ error: "invalid or expired oidc state" }, UNAUTHORIZED);
    }
    const config = await oidc.getConfig();
    // Reconstruct the callback URL from the validated, stored redirect_uri + the incoming query, so the
    // token-exchange redirect_uri matches what the IdP received even behind a proxy.
    const callbackUrl = new URL(tx.redirectUri);
    callbackUrl.search = incoming.search;
    const tokens = await authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: tx.codeVerifier,
      expectedNonce: tx.nonce,
      expectedState: tx.state,
    });
    const identity = identityFromClaims(tokens.claims(), oidc.claims);
    if (identity === null) {
      return c.json({ error: "oidc token carried no usable identity" }, UNAUTHORIZED);
    }
    const provisioned = await deps.sessions.provisionIdentity(identity);
    if (provisioned.outcome === "denied") {
      return c.json({ error: "not authorized for this application" }, UNAUTHORIZED);
    }
    if (!provisioned.enabled) {
      return c.json({ error: "account disabled" }, FORBIDDEN);
    }
    const session = await deps.sessions.create({
      userId: provisioned.userId,
      userAgent: c.req.header("user-agent") ?? null,
    });
    c.header("Set-Cookie", sessionCookieFor(session, deps.now()));
    return c.redirect("/", FOUND);
  });
}

/** Resolve a claim name that may be a dot-path (e.g. `user.memberOf`) against the claims object. A flat
 *  name is a single-key lookup; the walk short-circuits to `undefined` at any non-object segment. */
function readClaimPath(claims: { readonly [claim: string]: unknown }, path: string): unknown {
  let current: unknown = claims;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") {
      return;
    }
    current = (current as { readonly [k: string]: unknown })[segment];
  }
  return current;
}

/** Map verified OIDC ID-token claims → a `ResolvedIdentity`, or `null` when the configured username claim
 *  is absent/empty. Claim names are injected (`OidcClaimMap`) so a non-authentik IdP maps without a code
 *  change; each name may be a nested dot-path. */
export function identityFromClaims(claims: { readonly [claim: string]: unknown } | undefined, claimMap: OidcClaimMap): ResolvedIdentity | null {
  if (claims === undefined) {
    return null;
  }
  const username = readClaimPath(claims, claimMap.usernameClaim);
  if (typeof username !== "string" || username.length === 0) {
    return null;
  }
  const rawUid = readClaimPath(claims, claimMap.uidClaim);
  const uid = typeof rawUid === "string" && rawUid.length > 0 ? rawUid : null;
  const rawGroups = readClaimPath(claims, claimMap.groupsClaim);
  const groups = Array.isArray(rawGroups) ? rawGroups.filter((g): g is string => typeof g === "string") : [];
  const rawEmail = readClaimPath(claims, claimMap.emailClaim);
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;
  return {
    externalId: uid === null ? null : castId<ExternalId>(uid),
    handle: castId<Handle>(username),
    groups,
    email,
  };
}
