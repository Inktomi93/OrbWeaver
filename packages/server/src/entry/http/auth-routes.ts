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
import type { ExternalId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Configuration } from "openid-client";
import { authorizationCodeGrant, buildAuthorizationUrl, calculatePKCECodeChallenge, randomNonce, randomPKCECodeVerifier, randomState } from "openid-client";
import type { RevokedSessionsSummary } from "#domain/sessions";
import { securityEvent } from "#foundation/observability";
import type { BackchannelLogoutVerifier, OidcTransaction } from "#infra/auth";
import { hasCsrfHeader, MIN_PASSWORD_LENGTH, SESSION_COOKIE_NAME } from "#infra/auth";
import { clientIp } from "#infra/network";
import type { RateLimiter } from "../../transport/rate-limit.ts";
import { createRateLimiter } from "../../transport/rate-limit.ts";
import { readSessionCookie } from "../auth/index.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const OK = 200;
const FOUND = 302;
const MS_PER_SECOND = 1000;
const PKCE_METHOD = "S256";
// `__Host-` requires these three (Secure + Path=/ + no Domain); SameSite=Lax + HttpOnly complete the policy.
const COOKIE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";

const LOGIN_ROUTE = "/api/auth/login";
const FIRST_RUN_ROUTE = "/api/auth/first-run";
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
const OIDC_BACKCHANNEL_LOGOUT_ROUTE = "/api/auth/oidc/backchannel-logout";
const HANDLE_FIELD = "handle";
const PASSWORD_FIELD = "password";
const LOGOUT_TOKEN_FIELD = "logout_token";
// A7 — the SPA login route the callback lands the browser back on with a sanitized ?authError= code (never
// raw JSON on a top-level navigation). The codes below are a fixed lowercase snake_case set LoginSurface
// maps to copy; the IdP-supplied ones are already sanitized to the same shape.
const LOGIN_SURFACE_ROUTE = "/login";
const AUTH_ERROR_INVALID_STATE = "invalid_state";
const AUTH_ERROR_NO_IDENTITY = "no_identity";
const AUTH_ERROR_NOT_AUTHORIZED = "not_authorized";
// MS-W1 — the collision hard-deny: an SSO identity that matches an EXISTING account by email/handle. Distinct
// from `not_authorized` so the login surface tells the user to ask an admin to LINK the account (B5).
const AUTH_ERROR_ACCOUNT_EXISTS = "account_exists";
const AUTH_ERROR_ACCOUNT_DISABLED = "account_disabled";
// The IdP-supplied OAuth2/OIDC `error` param is a fixed lowercase snake_case enum; reflect it back only
// when it matches this shape (and cap the length) so raw IdP text can never reach the response body.
const OIDC_ERROR_CODE_RE = /^[a-z_]{1,64}$/;

/** A7 — land the browser back on the SPA login surface with a sanitized error code. `code` is always either
 *  a fixed literal above or an already-`sanitizeOidcErrorCode`d value, so it matches `[a-z_]{1,64}` and needs
 *  no further encoding — a top-level navigation never sees raw JSON. */
function loginErrorRedirect(c: Context, code: string): Response {
  return c.redirect(`${LOGIN_SURFACE_ROUTE}?authError=${code}`, FOUND);
}

/** MS-W1 — map a provision deny to its authError code: the collision deny (`account-exists`) gets its own
 *  operator-actionable code so the login surface can tell the user to have an admin LINK the account (B5);
 *  every other refusal is the generic not-authorized. */
function oidcDenyErrorCode(reason: "account-exists" | undefined): string {
  return reason === "account-exists" ? AUTH_ERROR_ACCOUNT_EXISTS : AUTH_ERROR_NOT_AUTHORIZED;
}

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

/** Serialize the `__Host-orb_session` Set-Cookie value with a Max-Age (seconds; clamped ≥ 0). Takes the
 *  branded `SessionToken` so no other secret (a handle, a `SessionId`, an OIDC code) can be written into
 *  the session cookie by accident.
 *
 *  ASYMMETRY, DELIBERATE — the write side emits the token RAW while the read side (`readSessionCookie`,
 *  `entry/auth/seam.ts`) runs `decodeURIComponent` on the value. That pairing is unreachable BY
 *  CONSTRUCTION, not by luck: the only value that ever reaches here is a `SessionToken`, and the only mint
 *  is `mintSessionToken` — 32 CSPRNG bytes rendered `base64url`, i.e. 43 chars from `[A-Za-z0-9_-]`. That
 *  alphabet contains no `%` and nothing `encodeURIComponent` would escape, so encode-then-decode is the
 *  identity on every token this function can be handed, and a raw write round-trips byte-identically. The
 *  brand is what keeps it that way: widen the parameter past `SessionToken` (or mint a token from a
 *  different alphabet) and the two sides stop agreeing — encode here at the same time. The permissive read
 *  stays because it must tolerate whatever an attacker-controlled `Cookie` header carries and fail closed. */
export function serializeSessionCookie(token: SessionToken, maxAgeSeconds: number): string {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAge}; ${COOKIE_ATTRS}`;
}

/** Serialize the cleared (logout) Set-Cookie value — same name + attrs, empty value, Max-Age=0. */
export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRS}`;
}

/** A6 — the IdP end-session (RP-initiated logout) URL, read from the discovered openid-client Configuration
 *  (`serverMetadata().end_session_endpoint`). Best-effort: null when there is no oidc config, discovery
 *  fails, or the issuer exposes no endpoint. The client navigates there after the local revoke so the
 *  upstream SSO session ends too. */
async function resolveEndSessionUrl(oidc: OidcRoutesDeps | undefined): Promise<string | null> {
  if (oidc === undefined) {
    return null;
  }
  try {
    const endpoint = (await oidc.getConfig()).serverMetadata().end_session_endpoint;
    return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
  } catch {
    return null;
  }
}

/** The `domain/sessions` slice the mint routes consume (the seam owns resolution; this is the write side). */
export interface AuthSessionsPort {
  readonly create: (params: {
    readonly userId: UserId;
    readonly userAgent?: string | null;
  }) => Promise<{ readonly token: SessionToken; readonly expiresAt: number }>;
  /** Returns WHICH session ended (`null` = already gone) so the route can evict that session's sockets. */
  readonly revokeByToken: (token: SessionToken) => Promise<SessionId | null>;
  /** `options` carries the caller-resolved admission decisions (A1 JIT gate / A2 approval). The OIDC callback
   *  passes them from env; the verb stays mode-agnostic. */
  readonly provisionIdentity: (
    identity: ResolvedIdentity,
    options?: { readonly allowJitProvision?: boolean; readonly requireApproval?: boolean },
  ) => Promise<ProvisionOutcome>;
  /** A5 — revoke every live session for the user(s) bound to an IdP subject (`sub`), for back-channel
   *  logout. Returns the count revoked + WHOSE (the route evicts those users' sockets). */
  readonly revokeByExternalId: (externalId: ExternalId) => Promise<RevokedSessionsSummary>;
}

/**
 * W7a — THE SESSION-DEATH → SOCKET-DEATH EDGE, as a port (staleness-and-session-freshness.md §4.4.3).
 *
 * A socket freezes its Principal at connect and lives for the connection's lifetime, so revoking the cookie
 * behind it changed nothing until the socket happened to die: a signed-out tab kept streaming. Composed HERE,
 * at entry, rather than inside `domain/sessions` — the cake is one-directional and a domain may not import
 * transport; entry already holds both halves.
 *
 * TWO GRANULARITIES, both owner-ruled (F4, 2026-08-14):
 *   • `evictSession` for LOGOUT — signing out on the phone must not close the desktop's stream. The cost of
 *     the granularity (threading a session identity from the seam to the socket cell) was put on the table
 *     explicitly and accepted; it is paid BESIDE the Principal, so D135's one-home role verdict is untouched.
 *   • `evictUser` for ADMIN REVOKE / disable / password reset / the OIDC back-channel logout — a statement
 *     about the HUMAN, and the only arm that also reaches sockets which authenticated with no session at all.
 *     Surviving devices whose own cookies are still valid reconnect and resume through the existing barrier.
 */
export interface SessionSocketEviction {
  readonly evictSession: (sessionId: SessionId) => number;
  readonly evictUser: (userId: UserId) => number;
}

/** The `provisionIdentity` result the OIDC callback dispatches on: `provisioned` (mint the session,
 *  gating on `enabled`) or `denied` (the login gate refused — no session). `reason:"account-exists"` is the
 *  MS-W1 collision deny the callback surfaces as a DISTINCT, operator-actionable authError. */
type ProvisionOutcome =
  | {
      readonly outcome: "provisioned";
      readonly userId: UserId;
      readonly enabled: boolean;
      readonly role: UserRole;
    }
  | { readonly outcome: "denied"; readonly reason?: "account-exists" };

/**
 * B4 — the local-mode FIRST-RUN owner-password setup deps. Present ONLY in local mode; its presence registers
 * `POST /api/auth/first-run`. This is an UNAUTHENTICATED endpoint that sets the owner's initial password, so
 * it is guarded like the owner-fallback, not like a normal route:
 *   • `originAllowed` — the same origin gate the owner-fallback uses (`ownerFallbackAllowed`): local/trusted
 *     origin only, so a fresh deploy's first-run window is not a remotely-hammerable password-set.
 *   • `setOwnerPassword` — the ONE-SHOT claim (hashes with the injected PasswordHasher, then the null-guarded
 *     `sessions.claimOwnerPassword`): returns the owner `UserId` iff it set a previously-null password, else
 *     `null` (already claimed). It can NEVER overwrite an existing owner credential — that is the admin-gated
 *     `resetPassword`'s job.
 */
export interface FirstRunRouteDeps {
  readonly setOwnerPassword: (plainPassword: string) => Promise<UserId | null>;
  readonly originAllowed: (headers: Headers) => boolean;
}

/** Local password verification, supplied from `sessions.authenticate` by the composition root in local mode. */
export interface LocalAuthenticator {
  // biome-ignore lint/style/useShorthandFunctionType: the shorthand `export type X = (...) => ...` alias trips the no-inline-types rule's broad `export type` arm (entry/ is not a contract type home), so keep the call-signature interface and suppress the biome INFO instead.
  (handle: Handle, password: string): Promise<UserId | null>;
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
  /** A4 — the groups-claim VALUE separator (`OIDC_GROUPS_SEPARATOR`, default ';'). A separator-joined
   *  string claim is split on it; an array is taken as-is. */
  readonly groupsSeparator: string;
  /** A1 — whether a first-login OIDC identity may be JIT-provisioned (`OIDC_SIGNUP`, default off). Resolved
   *  from env here (the oidc-only caller); passed into `provisionIdentity` so the verb stays mode-agnostic. */
  readonly allowJitProvision: boolean;
  /** A2 — whether a first-time OIDC user provisions `enabled:false` awaiting admin approval
   *  (`OIDC_REQUIRE_APPROVAL`, default off). */
  readonly requireApproval: boolean;
  readonly store: OidcMintStore;
  /** A5 — present only when `OIDC_BACKCHANNEL_LOGOUT=on`; its presence registers the back-channel logout
   *  endpoint. Carries the JWKS-verifying `verify` port + our client_id (the required `aud`). */
  readonly backchannelLogout?: {
    readonly verify: BackchannelLogoutVerifier["verify"];
    readonly clientId: string;
  };
}

export interface AuthRoutesDeps {
  readonly sessions: AuthSessionsPort;
  /** W7a — the live-socket eviction edge, applied wherever this file ends a session. */
  readonly sockets: SessionSocketEviction;
  readonly now: () => number;
  /** Backs the per-IP login throttle (shared `rate_limit_buckets` table — replica-correct). */
  readonly db: Db;
  /** The RESOLVED per-IP login-attempt cap/min (env floor ⊕ AppSettings override), read FRESH per attempt —
   *  a mid-session admin edit reloads the effective-config cache, so the next attempt sees the new cap (LIVE,
   *  the tRPC rate-limit-gate pattern). */
  readonly resolveLoginLimit: () => number;
  readonly authenticate?: LocalAuthenticator;
  /** B4 — present in local mode; registers the first-run owner-password setup route. */
  readonly firstRun?: FirstRunRouteDeps;
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

/** The DB-backed per-IP login throttle (shared `rate_limit_buckets` → replica-correct). Both the login route
 *  and the first-run route mint one over the SAME `login-ip` scope, so an attacker cannot dodge the cap by
 *  alternating the two unauthenticated CPU-heavy (scrypt) endpoints. The cap is the RESOLVED
 *  `AppSettings.rateLimits.login` (env floor ⊕ admin override), read FRESH per attempt. */
function loginThrottler(deps: AuthRoutesDeps): RateLimiter {
  return createRateLimiter(deps.db, {
    scope: LOGIN_RATE_SCOPE,
    points: () => deps.resolveLoginLimit(),
    windowMs: LOGIN_WINDOW_MS,
    now: deps.now,
  });
}

/** Register `POST /api/auth/login` (local mode only): body cap → per-IP throttle → verify → mint cookie. */
function registerLoginRoute(app: Hono, deps: AuthRoutesDeps, authenticate: LocalAuthenticator): void {
  // Body-limit belt runs first so a huge POST is rejected before the body buffers; the throttle then caps
  // brute-force + scrypt-CPU-flood.
  const loginLimiter = loginThrottler(deps);
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
    const userId = await authenticate(castId<Handle>(handle), password);
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

/** B4 — register `POST /api/auth/first-run` (local mode only): origin gate → body cap → per-IP throttle →
 *  min-length → ONE-SHOT owner-password claim → mint cookie. Guarded like the owner-fallback (see
 *  {@link FirstRunRouteDeps}): only reachable from a local/trusted origin, and it can never overwrite an
 *  owner credential that is already set (the claim is null-guarded and atomic). */
function registerFirstRunRoute(app: Hono, deps: AuthRoutesDeps, firstRun: FirstRunRouteDeps): void {
  const limiter = loginThrottler(deps);
  app.post(FIRST_RUN_ROUTE, bodyLimit({ maxSize: LOGIN_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    // Origin gate FIRST: an unauthenticated password-set must never be remotely hammerable (owner-fallback
    // parity). A public-origin local deploy sets LOCAL_INITIAL_PASSWORD instead of using this screen.
    if (!firstRun.originAllowed(c.req.raw.headers)) {
      securityEvent(
        "first_run_origin_rejected",
        { host: c.req.raw.headers.get("host") },
        "security: first-run owner-password setup from a non-local/untrusted origin — rejecting (set LOCAL_INITIAL_PASSWORD for a public-origin local deploy)",
      );
      return c.json({ error: "first-run setup is only available from a local/trusted origin" }, FORBIDDEN);
    }
    const throttled = await throttleLogin(limiter, c);
    if (throttled !== null) {
      return throttled;
    }
    const body = await c.req.parseBody();
    const password = typeof body[PASSWORD_FIELD] === "string" ? body[PASSWORD_FIELD] : "";
    if (password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` }, BAD_REQUEST);
    }
    const userId = await firstRun.setOwnerPassword(password);
    if (userId === null) {
      // ONE-SHOT: the owner credential is already set (or no owner row exists). Never overwrite — rotating an
      // existing owner password is the owner-gated `admin.resetPassword`.
      securityEvent(
        "first_run_already_claimed",
        {},
        "security: first-run owner-password setup attempted but the owner credential is already set — refusing (use admin reset-password to rotate)",
      );
      return c.json({ error: "the owner password is already set" }, CONFLICT);
    }
    const session = await deps.sessions.create({ userId, userAgent: c.req.header("user-agent") ?? null });
    c.header("Set-Cookie", sessionCookieFor(session, deps.now()));
    return c.json({ ok: true });
  });
}

/** Register the auth mint routes on `app`. Logout is always present; local login / first-run / OIDC are
 *  registered only when their injected op is supplied. */
export function registerAuthRoutes(app: Hono, deps: AuthRoutesDeps): void {
  const authenticate = deps.authenticate;
  if (authenticate !== undefined) {
    registerLoginRoute(app, deps, authenticate);
  }
  if (deps.firstRun !== undefined) {
    registerFirstRunRoute(app, deps, deps.firstRun);
  }

  app.post(LOGOUT_ROUTE, async (c) => {
    // Logout revokes the session (state-changing), so require the CSRF header like every cookie mutation —
    // else a cross-site top-level POST (SameSite=Lax rides the cookie) could force-logout.
    if (!hasCsrfHeader(c.req.raw.headers)) {
      return c.json({ error: "missing CSRF header" }, FORBIDDEN);
    }
    // The SAME reader the seam authenticates with (entry/auth/seam.ts) — a second copy here could revoke a
    // different token than the one that authenticated the request, leaving the live session un-killable.
    const token = readSessionCookie(c.req.raw.headers);
    if (token !== null) {
      const endedSessionId = await deps.sessions.revokeByToken(token);
      // W7a — the revoke kills the COOKIE; this kills the STREAM the cookie already opened. Per SESSION (F4):
      // this device's sockets close and its reconnect 401s into the client recovery ladder, while the same
      // human's other devices keep theirs. `null` = the row was already revoked, so there is nothing here to
      // have opened a socket that this call ends.
      if (endedSessionId !== null) {
        deps.sockets.evictSession(endedSessionId);
      }
    }
    c.header("Set-Cookie", serializeClearedSessionCookie());
    // A6 — surface the IdP end-session URL so the client can end the UPSTREAM SSO session after the local
    // revoke (else "sign out → Continue" logs straight back in). Best-effort + null when there is no oidc
    // config or the issuer exposes no end_session_endpoint. The local session is already dead regardless.
    return c.json({ endSessionUrl: await resolveEndSessionUrl(deps.oidc) }, OK);
  });

  const oidc = deps.oidc;
  if (oidc !== undefined) {
    registerOidcRoutes(app, deps, oidc);
  }
}

/** Build the Set-Cookie for a freshly minted session (Max-Age from the expiry minus the injected clock). */
function sessionCookieFor(session: { readonly token: SessionToken; readonly expiresAt: number }, now: number): string {
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

  // A7 — the callback is a TOP-LEVEL browser navigation, so every failure lands back on /login with a
  // sanitized ?authError= code (never raw JSON in the address bar). The codes are already sanitized (fixed
  // literals or `sanitizeOidcErrorCode` output), so this widens no leak surface over the prior 401/403 JSON.
  app.get(OIDC_CALLBACK_ROUTE, async (c) => {
    const incoming = new URL(c.req.url);
    const tx = await oidc.store.consume(incoming.searchParams.get("state") ?? "");
    if (tx === null) {
      return loginErrorRedirect(c, AUTH_ERROR_INVALID_STATE);
    }
    // The txn is now consumed (single-use), so every path below fails closed without leaving a replayable
    // state. If the IdP redirected back with a standard `?error=` (e.g. the user declined consent), surface
    // the sanitized code instead of blindly attempting the code→token exchange (which would throw anyway).
    const idpError = incoming.searchParams.get("error");
    if (idpError !== null) {
      const code = sanitizeOidcErrorCode(idpError);
      securityEvent("oidc_callback_error", { error: code }, "security: OIDC callback carried an IdP error param — no token exchange, no session");
      return loginErrorRedirect(c, code);
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
      return loginErrorRedirect(c, exchange.code);
    }
    const identity = identityFromClaims(exchange.claims, oidc.claims, oidc.groupsSeparator);
    if (identity === null) {
      return loginErrorRedirect(c, AUTH_ERROR_NO_IDENTITY);
    }
    // A1/A2 — the OIDC caller resolves admission from env and hands the verb resolved booleans (it stays
    // mode-agnostic). forward-header never routes here, so its JIT is unaffected.
    const provisioned = await deps.sessions.provisionIdentity(identity, {
      allowJitProvision: oidc.allowJitProvision,
      requireApproval: oidc.requireApproval,
    });
    if (provisioned.outcome === "denied") {
      // MS-W1 — a collision deny gets its own operator-actionable code; every other refusal is generic.
      return loginErrorRedirect(c, oidcDenyErrorCode(provisioned.reason));
    }
    if (!provisioned.enabled) {
      return loginErrorRedirect(c, AUTH_ERROR_ACCOUNT_DISABLED);
    }
    const session = await deps.sessions.create({
      userId: provisioned.userId,
      userAgent: c.req.header("user-agent") ?? null,
    });
    c.header("Set-Cookie", sessionCookieFor(session, deps.now()));
    return c.redirect("/", FOUND);
  });

  // A5 — RP back-channel logout. Registered only when OIDC_BACKCHANNEL_LOGOUT=on (deps.backchannelLogout set).
  // The IdP calls this server-to-server; the signed logout_token IS the authentication (no cookie, no CSRF).
  if (oidc.backchannelLogout !== undefined) {
    registerBackchannelLogout(app, deps, oidc, oidc.backchannelLogout);
  }
}

/** A5 — POST /api/auth/oidc/backchannel-logout. Validates the IdP `logout_token` against the issuer JWKS
 *  (the full OIDC BCL §2.4 checklist lives in `infra/auth/backchannel`), then revokes every session row for
 *  the subject. Returns 200 on success, 400 on any validation failure (per spec), always no-store.
 *  Idempotent — a re-delivered token re-revokes nothing (no Redis replay cache needed). */
function registerBackchannelLogout(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps, bcl: NonNullable<OidcRoutesDeps["backchannelLogout"]>): void {
  app.post(OIDC_BACKCHANNEL_LOGOUT_ROUTE, async (c) => {
    c.header("Cache-Control", "no-store");
    const body = await c.req.parseBody();
    const logoutToken = typeof body[LOGOUT_TOKEN_FIELD] === "string" ? body[LOGOUT_TOKEN_FIELD] : "";
    // Per OIDC BCL §2.7 a failed logout returns 400 with a JSON `error` (error_description is optional and
    // omitted here — this is a server-to-server call, so a single machine code is enough and keeps the
    // response body free of a snake_case wire field).
    if (logoutToken.length === 0) {
      return c.json({ error: "invalid_request" }, BAD_REQUEST);
    }
    const meta = (await oidc.getConfig()).serverMetadata();
    const jwksUri = meta.jwks_uri;
    if (typeof jwksUri !== "string" || jwksUri.length === 0) {
      return c.json({ error: "server_error" }, BAD_REQUEST);
    }
    const subject = await bcl.verify({ logoutToken, jwks: jwksUri, issuer: meta.issuer, audience: bcl.clientId });
    if (subject === null) {
      // The verifier already emitted a securityEvent naming the exact violation.
      return c.json({ error: "invalid_request" }, BAD_REQUEST);
    }
    if (subject.sub !== null) {
      const { revoked, userIds } = await deps.sessions.revokeByExternalId(castId<ExternalId>(subject.sub));
      // W7a — per USER here, not per session: the IdP has ended the HUMAN's login, and one subject can be
      // bound to more than one row. Idempotent with the revoke itself — a re-delivered logout token names no
      // users and evicts nothing.
      for (const userId of userIds) {
        deps.sockets.evictUser(userId);
      }
      securityEvent("oidc_backchannel_logout", { revoked }, "security: OIDC back-channel logout — revoked all sessions for the subject");
    }
    // sid-only (no sub): the token validated, but we key sessions on external_id==sub and store no per-session
    // IdP sid, so there is nothing to action. Still a 200 (the token was well-formed and authentic).
    return c.body(null, OK);
  });
}

/** A4 — parse the groups-claim VALUE. An array yields its string members (unchanged prior behavior); a
 *  single string is split on the configured separator (an authentik property mapping may emit a ';'-joined
 *  string), trimmed, empties dropped — a string with no separator is one group. Anything else ⇒ []. Before
 *  this, a joined string yielded [], which under `OIDC_ALLOWED_GROUPS` denied EVERY login (a fail-closed
 *  misconfiguration that reads like a broken IdP). */
function normalizeGroups(raw: unknown, separator: string): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((g): g is string => typeof g === "string");
  }
  if (typeof raw === "string" && raw.length > 0) {
    return raw
      .split(separator)
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
  }
  return [];
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
 *  change; each name may be a nested dot-path.
 *
 *  #34 — THIS IS ALSO THE CONFIG-TIER SIGNAL FOR A SILENTLY-DISABLED CONTROL. `externalId` is the identity
 *  key, and the bind-once takeover refusal (`isSubjectMismatch`, `domain/sessions/verbs/provision-identity`)
 *  is scoped to SUBJECT-BEARING logins on purpose — a null subject carries no claim that could contradict a
 *  row's binding, so the guard cannot fire and a handle match walks onto whatever row holds that handle. In
 *  `forward-header` that IS the model (the proxy asserted the handle behind the trusted-peer gate); in
 *  `oidc` it is a MISCONFIGURATION, because OIDC Core REQUIRES `sub` in an ID token, so a null here means
 *  `OIDC_UID_CLAIM` names a claim this IdP does not emit — and the box then runs guard-less for every login
 *  with nothing saying so. This mapper is the oidc-only seam (forward-header resolves in
 *  `infra/auth/modes/forward-header.ts`), so the warn is mode-scoped by construction. It is OBSERVABILITY:
 *  the returned identity is byte-identical with or without it, because refusing a subject-less login would
 *  break forward-header entirely — see `isSubjectMismatch`'s scope note, which prescribes exactly this. */
export function identityFromClaims(
  claims: { readonly [claim: string]: unknown } | undefined,
  claimMap: OidcClaimMap,
  groupsSeparator = ";",
): ResolvedIdentity | null {
  if (claims === undefined) {
    return null;
  }
  const username = readClaimPath(claims, claimMap.usernameClaim);
  if (typeof username !== "string" || username.length === 0) {
    // Already fail-closed (no identity ⇒ no session), so there is no guard-less login to report — and
    // warning here would drown the real signal in noise from probes and misdirected requests.
    return null;
  }
  const rawUid = readClaimPath(claims, claimMap.uidClaim);
  const uid = typeof rawUid === "string" && rawUid.length > 0 ? rawUid : null;
  if (uid === null) {
    securityEvent(
      "oidc_subject_claim_missing",
      { handle: username, uidClaim: claimMap.uidClaim },
      "security: an OIDC login carried no stable subject — OIDC_UID_CLAIM names a claim this IdP does not emit, so every login provisions externalId=null and the bind-once account-takeover guard cannot fire; point OIDC_UID_CLAIM at a claim the IdP emits (`sub` is required by OIDC Core)",
    );
  }
  const groups = normalizeGroups(readClaimPath(claims, claimMap.groupsClaim), groupsSeparator);
  const rawEmail = readClaimPath(claims, claimMap.emailClaim);
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;
  return {
    externalId: uid === null ? null : castId<ExternalId>(uid),
    handle: castId<Handle>(username),
    groups,
    email,
  };
}
