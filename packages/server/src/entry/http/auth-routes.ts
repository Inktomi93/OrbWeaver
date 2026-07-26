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
import type { Db } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Configuration } from "openid-client";
import { authorizationCodeGrant, buildAuthorizationUrl, calculatePKCECodeChallenge, randomNonce, randomPKCECodeVerifier, randomState } from "openid-client";
import { securityEvent } from "#foundation/observability";
import type { OidcTransaction } from "#infra/auth";
import { hasCsrfHeader, SESSION_COOKIE_NAME } from "#infra/auth";
import { clientIp } from "#infra/network";
import type { RateLimiter } from "../../transport/rate-limit";
import { createRateLimiter } from "../../transport/rate-limit";

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
const TOO_MANY_REQUESTS = 429;
const PAYLOAD_TOO_LARGE = 413;
const LOGIN_BODY_KIB = 4;
const BYTES_PER_KIB = 1024;
// Per-IP login throttle: caps brute-force + scrypt-CPU-flood on the only unauthenticated CPU-heavy endpoint
// `local` mode opens (the tRPC rate-limit mount doesn't cover this plain Hono route). DB-backed
// (transport/rate-limit) so the cap holds across replicas. The cap itself is `AppSettings.rateLimits.login`
// (env floor RATE_LIMIT_LOGIN=10 ⊕ admin override), resolved fresh per attempt via `deps.resolveLoginLimit`.
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_RATE_SCOPE = "login-ip";
// The anonymous caller when no peer IP resolves — one shared throttle bucket beats an un-throttled hole.
const UNKNOWN_IP_KEY = "unknown";
// Credentials are tiny; cap the login body so a huge POST can't DoS this unauthenticated endpoint.
const LOGIN_BODY_MAX_BYTES = LOGIN_BODY_KIB * BYTES_PER_KIB;
const OIDC_LOGIN_ROUTE = "/api/auth/oidc/login";
const OIDC_CALLBACK_ROUTE = "/api/auth/oidc/callback";
const HANDLE_FIELD = "handle";
const PASSWORD_FIELD = "password";
// The IdP-supplied OAuth2/OIDC `error` param is a fixed lowercase snake_case enum; reflect it back only
// when it matches this shape (and cap the length) so raw IdP text can never reach the response body.
const OIDC_ERROR_CODE_RE = /^[a-z_]{1,64}$/;

/** Sanitize the IdP's callback `error` code: return it only when it matches the fixed OAuth2 error shape,
 *  else a generic marker — never reflect attacker/IdP-supplied free text into the response. */
function sanitizeOidcErrorCode(raw: string | null | undefined): string {
  return typeof raw === "string" && OIDC_ERROR_CODE_RE.test(raw) ? raw : "token_exchange_failed";
}

/** Narrow a thrown grant error to openid-client's `AuthorizationResponseError`-shaped `.error` carrier
 *  without importing the class — the code is still sanitized before it reaches the response. */
function hasOidcErrorCode(err: unknown): err is { readonly error: string } {
  return typeof err === "object" && err !== null && "error" in err && typeof (err as { error: unknown }).error === "string";
}

type OidcExchangeResult =
  | { readonly ok: true; readonly claims: { readonly [claim: string]: unknown } | undefined }
  | { readonly ok: false; readonly code: string };

/** Run the JWKS-verified code→token exchange, converting every throw (replayed/expired code, issuer /
 *  nonce / state mismatch, or a transient IdP/network fault) into a fail-closed result — never a 500 that
 *  leaks a stack path through the observability onError. On the error path the caller mints no session. */
async function exchangeCodeForClaims(config: Configuration, callbackUrl: URL, tx: OidcTransaction): Promise<OidcExchangeResult> {
  try {
    const tokens = await authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: tx.codeVerifier,
      expectedNonce: tx.nonce,
      expectedState: tx.state,
    });
    return { ok: true, claims: tokens.claims() };
  } catch (err) {
    return { ok: false, code: sanitizeOidcErrorCode(hasOidcErrorCode(err) ? err.error : null) };
  }
}

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
  /** Backs the per-IP login throttle (shared `rate_limit_buckets` table — replica-correct). */
  readonly db: Db;
  /** The RESOLVED per-IP login-attempt cap/min (env floor ⊕ AppSettings override), read FRESH per attempt —
   *  a mid-session admin edit reloads the effective-config cache, so the next attempt sees the new cap (LIVE,
   *  the tRPC rate-limit-gate pattern). */
  readonly resolveLoginLimit: () => number;
  readonly authenticate?: LocalAuthenticator;
  readonly oidc?: OidcRoutesDeps;
}

/** Consume one login-throttle point for the caller IP; returns a 429 Response when over budget, else null
 *  (proceed). Keyed on the peer-first `clientIp` the ingress gate + tRPC seam share (no drift). */
async function throttleLogin(limiter: RateLimiter, c: Context): Promise<Response | null> {
  try {
    await limiter.consume(clientIp(c) ?? UNKNOWN_IP_KEY);
    return null;
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      if (err.msBeforeNext !== undefined) {
        c.header("Retry-After", String(Math.max(1, Math.ceil(err.msBeforeNext / MS_PER_SECOND))));
      }
      securityEvent("login_throttled", { clientIp: clientIp(c) }, "security: login attempts over the per-IP throttle — 429");
      return c.json({ error: "too many attempts; try again shortly" }, TOO_MANY_REQUESTS);
    }
    throw err;
  }
}

/** Register `POST /api/auth/login` (local mode only): body cap → per-IP throttle → verify → mint cookie. */
function registerLoginRoute(app: Hono, deps: AuthRoutesDeps, authenticate: LocalAuthenticator): void {
  // DB-backed throttle (shared rate_limit_buckets → replica-correct). Body-limit belt runs first so a huge
  // POST is rejected before the body buffers; the throttle then caps brute-force + scrypt-CPU-flood. The cap
  // is the RESOLVED `AppSettings.rateLimits.login` (env floor RATE_LIMIT_LOGIN=10 ⊕ admin override), read
  // FRESH per attempt so an admin edit is LIVE (the tRPC gate's live-cap pattern, entry/rate-limit-gate.ts).
  const loginLimiter = createRateLimiter(deps.db, {
    scope: LOGIN_RATE_SCOPE,
    points: () => deps.resolveLoginLimit(),
    windowMs: LOGIN_WINDOW_MS,
    now: deps.now,
  });
  app.post(LOGIN_ROUTE, bodyLimit({ maxSize: LOGIN_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    const throttled = await throttleLogin(loginLimiter, c);
    if (throttled !== null) {
      return throttled;
    }
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

/** Register the auth mint routes on `app`. Logout is always present; local login / OIDC are registered
 *  only when their injected op is supplied. */
export function registerAuthRoutes(app: Hono, deps: AuthRoutesDeps): void {
  const authenticate = deps.authenticate;
  if (authenticate !== undefined) {
    registerLoginRoute(app, deps, authenticate);
  }

  app.post(LOGOUT_ROUTE, async (c) => {
    // Logout revokes the session (state-changing), so require the CSRF header like every cookie mutation —
    // else a cross-site top-level POST (SameSite=Lax rides the cookie) could force-logout.
    if (!hasCsrfHeader(c.req.raw.headers)) {
      return c.json({ error: "missing CSRF header" }, FORBIDDEN);
    }
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
    // The txn is now consumed (single-use), so every path below fails closed without leaving a replayable
    // state. If the IdP redirected back with a standard `?error=` (e.g. the user declined consent), surface
    // the sanitized code instead of blindly attempting the code→token exchange (which would throw anyway).
    const idpError = incoming.searchParams.get("error");
    if (idpError !== null) {
      const code = sanitizeOidcErrorCode(idpError);
      securityEvent("oidc_callback_error", { error: code }, "security: OIDC callback carried an IdP error param — no token exchange, no session");
      return c.json({ error: `oidc login failed: ${code}` }, UNAUTHORIZED);
    }
    const config = await oidc.getConfig();
    // Reconstruct the callback URL from the validated, stored redirect_uri + the incoming query, so the
    // token-exchange redirect_uri matches what the IdP received even behind a proxy.
    const callbackUrl = new URL(tx.redirectUri);
    callbackUrl.search = incoming.search;
    const exchange = await exchangeCodeForClaims(config, callbackUrl, tx);
    if (!exchange.ok) {
      securityEvent(
        "oidc_token_exchange_failed",
        { error: exchange.code },
        "security: OIDC code→token exchange failed (replay/expiry/mismatch/transient) — no session minted",
      );
      return c.json({ error: `oidc login failed: ${exchange.code}` }, UNAUTHORIZED);
    }
    const identity = identityFromClaims(exchange.claims, oidc.claims);
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
