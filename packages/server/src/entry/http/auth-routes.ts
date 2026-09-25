// The auth mint routes + cookie I/O. This is the write side of the session cookie (the read side is the
// seam + infra/auth); the cookie's NAME and attributes are `infra/auth/modes/cookie-session.ts`'s, one per
// request transport (`infra/auth/transport.ts`): `__Host-orb_session` over https, `orb_session_insecure` over
// plain http. Every write goes through `writeSetCookies` so the other name is CLEARED in the same response.
// Never re-implements identity resolution: mints sessions via domain/sessions and writes the cookie;
// resolution belongs to the seam.
//
// Local login: password-form → verify (injected `authenticate` port) → sessions.create → set cookie.
// Registered only when the op is provided (fail-closed in non-local modes).
//
// OIDC login: openid-client v6 flow — discovery → PKCE + state + nonce → binding cookie → buildAuthorizationUrl
// (redirect) → callback: binding cookie must match `state` (login CSRF) → consume the PKCE txn → the injected
// code→token `exchange` → claims → provisionIdentity → mint cookie. Registered only when `OidcRoutesDeps` is
// supplied. The two I/O round-trips (discovery and the token exchange) both arrive as INJECTED deps
// (#762 / #867) — this file performs no HTTP to the IdP itself, which is what makes the whole callback
// drivable in-process by a test.
//
// Origin-flexible callback: the redirect_uri is derived per-request from the origin and accepted only if
// it exact-matches the OIDC_REDIRECT_URIS allowlist — never reflects an attacker-supplied origin
// (open-redirect class). The validated redirect_uri is stored in the transaction and reconstructed at the
// callback so the token exchange presents the same redirect_uri the IdP saw, even behind a proxy.

import type { PendingJoinErrorCode } from "@orb/contracts/chat";
import { invitePreviewSchema, pendingJoinConfirmRequestSchema } from "@orb/contracts/chat";
import type { RequestTransport, ResolvedIdentity, SignupErrorCode, SignupRequest, UserRole } from "@orb/contracts/identity";
import { signupRequestSchema } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { ExternalId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Configuration } from "openid-client";
import { buildAuthorizationUrl, calculatePKCECodeChallenge, randomNonce, randomPKCECodeVerifier, randomState } from "openid-client";
import type { SignupInviteOps } from "#domain/chat";
import type { RevokedSessionsSummary, SessionsService } from "#domain/sessions";
import { groupRoleGovernanceActive } from "#domain/sessions";
import { getLog, groupsLogFields, securityEvent } from "#foundation/observability";
import type { BackchannelLogoutVerifier, OidcExchange, OidcTransaction, PublicHttpMintNotice } from "#infra/auth";
import {
  hasCsrfHeader,
  MIN_PASSWORD_LENGTH,
  OIDC_BINDING_COOKIES,
  OIDC_PENDING_JOIN_COOKIES,
  OIDC_PENDING_JOIN_TTL_MS,
  OIDC_TRANSACTION_TTL_MS,
  oidcBindingCookieFor,
  oidcPendingJoinCookieFor,
  readRequestCookie,
  reportPublicHttpMint,
  requestClientScope,
  requestTransport,
  SESSION_COOKIES,
  sessionCookieFor,
} from "#infra/auth";
import { addressThrottleKey, clientIp, peerIp } from "#infra/network";
import type { RateLimiter } from "../../transport/rate-limit.ts";
import { createRateLimiter } from "../../transport/rate-limit.ts";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import { readSessionCookie } from "../auth/index.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const NOT_FOUND = 404;
const OK = 200;
const FOUND = 302;
const MS_PER_SECOND = 1000;
const PKCE_METHOD = "S256";

const LOGIN_ROUTE = "/api/auth/login";
const FIRST_RUN_ROUTE = "/api/auth/first-run";
const LOGOUT_ROUTE = "/api/auth/logout";
const SIGNUP_ROUTE = "/api/auth/signup";
// D254 — the per-invite signup axis. The per-handle login axis caps nothing on a signup (the attacker picks the
// handle), so the second axis keys on the invite the attempt spends against. Same window and knob as login.
const SIGNUP_INVITE_RATE_SCOPE = "signup-invite";
const TOO_MANY_REQUESTS = 429;
const PAYLOAD_TOO_LARGE = 413;
const LOGIN_BODY_KIB = 4;
const BYTES_PER_KIB = 1024;
const OIDC_BACKCHANNEL_BODY_KIB = 16;
// Per-IP login throttle: caps brute-force + scrypt-CPU-flood on the only unauthenticated CPU-heavy endpoint
// `local` mode opens (the tRPC rate-limit mount doesn't cover this plain Hono route). DB-backed
// (transport/rate-limit) so the cap holds across replicas. The cap itself is `AppSettings.rateLimits.login`
// (env floor RATE_LIMIT_LOGIN=10 ⊕ admin override), resolved fresh per attempt via `deps.resolveLoginLimit`.
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_RATE_SCOPE = "login-ip";
// B1 — THE SECOND LOGIN THROTTLE AXIS: the same DB-backed fixed window, keyed on the HANDLE. The per-IP cap
// is structurally blind to the distributed shape (N botnet IPs × the cap, all against ONE account), which is
// the brute force that actually finds a password. Both axes must pass INDEPENDENTLY for an attempt to reach
// `authenticate`.
//   NEVER A LOCKOUT: same 60s rolling window, no persisted per-account state, nothing an attacker can latch.
//   Hammering someone's handle SLOWS them for at most one window; the next window is clean.
//   THE CAP SITS ABOVE THE PER-IP ONE (×3, derived from the same admin-flippable `rateLimits.login` so there
//   is still ONE knob): a single-source attacker therefore always trips the IP axis first, and this belt only
//   bites what that axis cannot see. It is also why a legitimate human never reaches it — nobody types their
//   own password wrong 30 times in a minute, and the axis is per-ACCOUNT, so a shared NAT cannot pool onto it.
const LOGIN_HANDLE_RATE_SCOPE = "login-handle";
const LOGIN_HANDLE_LIMIT_MULTIPLIER = 3;
// The handle is attacker-controlled text (up to the 4 KiB body cap) that becomes part of a row KEY in the
// shared bucket table — bound it. Two absurd handles sharing the first 128 chars share a bucket; neither
// authenticates against anything, so the only effect is a stricter throttle on garbage.
const HANDLE_KEY_MAX_CHARS = 128;
// The anonymous caller when no peer IP resolves — one shared throttle bucket beats an un-throttled hole.
const UNKNOWN_IP_KEY = "unknown";
// Credentials are tiny; cap the login body so a huge POST can't DoS this unauthenticated endpoint.
const LOGIN_BODY_MAX_BYTES = LOGIN_BODY_KIB * BYTES_PER_KIB;
// A compact JWT fits comfortably; the cap bounds unauthenticated form parsing before signature validation.
const OIDC_BACKCHANNEL_BODY_MAX_BYTES = OIDC_BACKCHANNEL_BODY_KIB * BYTES_PER_KIB;
const OIDC_LOGIN_ROUTE = "/api/auth/oidc/login";
const OIDC_CALLBACK_ROUTE = "/api/auth/oidc/callback";
const OIDC_BACKCHANNEL_LOGOUT_ROUTE = "/api/auth/oidc/backchannel-logout";
// D254 — the signed-out pending join: the surface the callback lands on, and its two same-origin routes.
const OIDC_PENDING_JOIN_SURFACE = "/login?pendingJoin=1";
const OIDC_PENDING_PREVIEW_ROUTE = "/api/auth/oidc/pending/preview";
const OIDC_PENDING_CONFIRM_ROUTE = "/api/auth/oidc/pending/confirm";
const INVITE_PARAM = "invite";
// A real invite token is 43 base64url chars. A longer param is carried as no invite, never hashed or stored.
const INVITE_PARAM_MAX_CHARS = 128;
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
function oidcDenyErrorCode(reason: ProvisionDenyReason | undefined): string {
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
  | {
      readonly ok: true;
      readonly claims: { readonly [claim: string]: unknown } | undefined;
      /** #141 — the RAW verified ID token, carried straight to `sessions.create` which seals it at rest.
       *  It is a SECRET: it is never logged, never put in a response body, and never held past the mint. */
      readonly idToken: string | null;
    }
  | { readonly ok: false; readonly code: string };

/** Run the JWKS-verified code→token exchange, converting every throw (replayed/expired code, issuer /
 *  nonce / state mismatch, or a transient IdP/network fault) into a fail-closed result — never a 500 that
 *  leaks a stack path through the observability onError. On the error path the caller mints no session.
 *
 *  #867 — THE EXCHANGE ITSELF IS INJECTED (`OidcRoutesDeps.exchange`, wired to the real `openid-client`
 *  `authorizationCodeGrant` at the composition root). THIS function keeps the fail-closed conversion and the
 *  sanitizer, so a test's fake exchange cannot route around either: whatever it throws lands in the same
 *  catch, and whatever code it carries is sanitized by the same `[a-z_]{1,64}` gate before it can reach a
 *  Location header.
 *
 *  The ID token comes back alongside the claims (#141) rather than being re-derived later: the exchange has
 *  already VERIFIED it (signature, issuer, audience, nonce, PKCE), and this is the only moment the raw
 *  compact JWT exists in the process. */
async function exchangeCodeForClaims(exchange: OidcExchange, config: Configuration, callbackUrl: URL, tx: OidcTransaction): Promise<OidcExchangeResult> {
  try {
    const tokens = await exchange(config, callbackUrl, tx);
    return { ok: true, claims: tokens.claims, idToken: tokens.idToken };
  } catch (err) {
    return { ok: false, code: sanitizeOidcErrorCode(hasOidcErrorCode(err) ? err.error : null) };
  }
}

/** Serialize the session-cookie Set-Cookie value under the request transport's name + attributes
 *  (`sessionCookieFor`), with a Max-Age (seconds; clamped ≥ 0). Takes the branded `SessionToken` so no other
 *  secret (a handle, a `SessionId`, an OIDC code) can be written into the session cookie by accident.
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
export function serializeSessionCookie(token: SessionToken, transport: RequestTransport, maxAgeSeconds: number): string {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  const { name, attrs } = sessionCookieFor(transport);
  return `${name}=${token}; Max-Age=${maxAge}; ${attrs}`;
}

/**
 * Serialize the cleared (logout) Set-Cookie value for EVERY session cookie name (`SESSION_COOKIES`,
 * `infra/auth/modes/cookie-session.ts`) — empty value, `Max-Age=0`, each under the attributes its own name
 * requires.
 *
 * BOTH NAMES, NOT JUST THE REQUEST'S: a browser that signed in over both transports holds both. Only the
 * request's name is ever read, so the other cannot authenticate this request — but it is still a live session
 * token in a jar, and "log out" must mean the browser stops holding one.
 *
 * BEST-EFFORT IN ONE DIRECTION, STATED SO IT IS NOT MISREAD AS A GUARANTEE: the `__Host-` clear necessarily
 * carries `Secure`, so a browser on a plain-http origin DISCARDS it (RFC 6265bis §4.1.3.2) — i.e. a logout
 * over plain http leaves an https cookie in place. That cookie is never read over http, and over https both
 * clears land.
 */
export function serializeClearedSessionCookies(): readonly string[] {
  return SESSION_COOKIES.map(({ name, attrs }) => `${name}=; Max-Age=0; ${attrs}`);
}

/** The Set-Cookie values a MINT writes: the new session under the transport's name, plus a clear of the
 *  other name, so a sign-in never leaves a token from the other transport in the jar. Ordered mint-first. */
function serializeMintedSessionCookies(token: SessionToken, transport: RequestTransport, maxAgeSeconds: number): readonly string[] {
  const active = sessionCookieFor(transport).name;
  return [
    serializeSessionCookie(token, transport, maxAgeSeconds),
    ...SESSION_COOKIES.filter(({ name }) => name !== active).map(({ name, attrs }) => `${name}=; Max-Age=0; ${attrs}`),
  ];
}

/** Write a list of `Set-Cookie` values onto the response. APPEND, never set: a second bare `c.header` call
 *  REPLACES the first, which would silently ship only the last cookie of a clear-both / mint-plus-clear pair. */
function writeSetCookies(c: Context, values: readonly string[]): void {
  for (const value of values) {
    c.header("Set-Cookie", value, { append: true });
  }
}

/** The authorize leg's binding cookie: the transaction's `state` under the transport's binding name, alive
 *  exactly as long as the transaction. The value is `randomState()` output (base64url), so the raw write
 *  round-trips through {@link readRequestCookie}'s decode unchanged. */
function serializeOidcBindingCookie(state: string, transport: RequestTransport): string {
  const { name, attrs } = oidcBindingCookieFor(transport);
  return `${name}=${state}; Max-Age=${OIDC_TRANSACTION_TTL_MS / MS_PER_SECOND}; ${attrs}`;
}

/** Clear every binding name once the callback has spent the binding (the logout pattern: the `__Host-` clear
 *  is dropped over plain http, and that cookie is never read there). */
function serializeClearedOidcBindingCookies(): readonly string[] {
  return OIDC_BINDING_COOKIES.map(({ name, attrs }) => `${name}=; Max-Age=0; ${attrs}`);
}

/**
 * Consume the callback's transaction only when this browser started it: the request must carry the binding
 * cookie the authorize leg set, under its own transport's name, holding exactly the returned `state`.
 * Anything else is `null`, the invalid-state refusal, and the transaction is left untouched.
 *
 * This is the login-CSRF control. The attack it stops: an attacker starts a login in their own browser,
 * stops at the callback URL, and makes a victim open it; without the binding the victim is signed into the
 * attacker's account and may store credentials there. Do not drop the check, fall back to the other
 * transport's name, or accept a missing cookie "for compatibility" — each of those reopens the attack.
 *
 * Plain `!==` is enough: both sides come from the caller's own request, so timing reveals nothing it lacks.
 * A matched binding is spent with its transaction, so it is cleared even when the transaction has expired.
 */
async function consumeBoundTransaction(c: Context, store: OidcMintStore, state: string): Promise<OidcTransaction | null> {
  const transport = requestTransport(c);
  const binding = readRequestCookie(c.req.raw.headers, oidcBindingCookieFor(transport).name);
  if (binding === null || binding.length === 0 || binding !== state) {
    securityEvent(
      "oidc_callback_unbound",
      { transport, bindingPresent: binding !== null },
      "security: OIDC callback state is not bound to this browser (missing or mismatched binding cookie) — a login-CSRF attempt, a second login tab, or a callback opened in another browser; no transaction consumed, no session minted",
    );
    return null;
  }
  writeSetCookies(c, serializeClearedOidcBindingCookies());
  return await store.consume(state);
}

/** The OIDC RP-Initiated Logout query parameters. Wire-fixed snake_case (OIDC Core / RP-Initiated Logout
 *  1.0) — these are the IdP's spelling, not ours. */
const ID_TOKEN_HINT_PARAM = "id_token_hint";
const POST_LOGOUT_REDIRECT_PARAM = "post_logout_redirect_uri";

/**
 * #141 — the post-logout return target, derived from the ALREADY-VALIDATED OIDC callback origin.
 *
 * This is an OPEN-REDIRECT-SHAPED parameter (we hand the IdP a URL and it navigates the user's browser
 * there), so it is never built from a raw request header. `deriveRedirectUri` resolves the request's origin
 * and returns it ONLY when it exact-matches the `OIDC_REDIRECT_URIS` allowlist — the same gate the login
 * mint uses — and we then swap that allowlisted callback URL's PATH for `/login`. So the host/scheme can
 * only ever be one the operator configured, and an off-allowlist / unresolvable origin yields `null`
 * (no param at all), never a reflected one.
 *
 * THE OUTPUT IS BYTE-EXACT BY CONSTRUCTION, and it has to be: authentik matches this value STRICTLY against
 * the URL registered on the provider (`redirect_uri_type: logout` — `https://orbweaver.example.com/login`
 * is registered today), so a trailing slash or a stray query makes the OP reject the whole request.
 * `new URL("/login", <allowlisted callback>)` yields exactly `<scheme>://<host>/login` — no trailing slash
 * (URL only appends one for an origin-only path) and no query. Do not "normalise" it.
 */
function postLogoutRedirectUri(headers: Headers, transport: RequestTransport, allowlist: readonly string[]): string | null {
  const callbackUri = deriveRedirectUri(headers, transport, allowlist);
  if (callbackUri === null) {
    return null;
  }
  return new URL(LOGIN_SURFACE_ROUTE, callbackUri).href;
}

/**
 * A6/#141 — the IdP end-session (RP-initiated logout) URL, read from the discovered openid-client
 * Configuration (`serverMetadata().end_session_endpoint`). The client navigates there after the local revoke
 * so the UPSTREAM SSO session ends too (else "sign out → Continue" logs straight back in). Best-effort:
 * null when there is no oidc config, discovery fails, or the issuer exposes no endpoint.
 *
 * THE TWO PARAMS ARE INSEPARABLE, AND THE ORDER OF THIS FUNCTION'S GUARDS IS THE CONTROL. OIDC RP-Initiated
 * Logout pairs `id_token_hint` with `post_logout_redirect_uri`, and an OP that receives a redirect URI with
 * no hint is entitled to refuse the whole request. Measured against THIS deployment's IdP (authentik
 * 2026.5.5, `providers/oauth2/views/end_session.py` `EndSessionView.validate`): when
 * `post_logout_redirect_uri` is present AND the provider has ANY registered post-logout URI, a missing
 * `id_token_hint` raises `invalid_request`/`id_token_hint_missing` → a 400 page. That raise happens BEFORE
 * the flow planner, so the invalidation flow never runs: the IdP's access tokens are not deleted, the logout
 * stage never fires, and THE SSO SESSION SURVIVES (regression #437 — a redirect param alone is strictly
 * WORSE than sending nothing, which is what #141's first attempt, 8446a55ce, shipped and why it was
 * reverted).
 *
 * So there are exactly three shapes this returns, and no fourth is constructible here:
 *   • HINT + REDIRECT — the session carried an id_token AND the request origin is allowlisted. The IdP
 *     silently confirms and returns the browser to our `/login` (the owner-observed papercut, closed).
 *   • HINT ONLY — the session carried an id_token but the origin did not resolve. Spec-legal and accepted
 *     by the OP; the user lands on the IdP's own logged-out page, and the SSO session still ends.
 *   • BARE — no hint (a local/first-run login, a pre-#141 session row, or a rotated `SESSION_SECRET` that
 *     made the stored blob unopenable). The pre-#141 behaviour, deliberately preserved as the degrade.
 * The redirect param is NEVER emitted without the hint. `hint === null` returns before it is even computed.
 *
 * WHERE THE HINT ENDS UP, stated plainly rather than implied. RP-Initiated Logout is a FRONT-CHANNEL
 * protocol: the RP hands the browser a URL carrying `id_token_hint`, so the token necessarily reaches the
 * user's own browser (address bar, history, the IdP's access log). That is the spec's design and it is not
 * an escalation — an ID token is an identity ASSERTION ABOUT THAT USER, not an access or refresh token: it
 * cannot mint an Orbweaver session (we never accept one as a credential), and it cannot call the IdP's API.
 * The one thing a stolen hint buys is logging that user out. What this function still owes, and keeps: it
 * never puts the hint in a LOG line, never returns it as a field of its own, and never lets it reach a
 * DIFFERENT user's response — the hint comes from the row the caller's own cookie just revoked.
 */
async function resolveEndSessionUrl(
  oidc: OidcRoutesDeps | undefined,
  hint: string | null,
  headers: Headers,
  transport: RequestTransport,
): Promise<string | null> {
  if (oidc === undefined) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): `null` is the DOCUMENTED degraded arm this function's JSDoc above describes — an unreachable IdP discovery means we send no end-session param and the user lands on our own `/login` instead of the IdP's logged-out page. The LOCAL logout has already happened either way, so this can only cost a redirect, never a session. Ends if end-session becomes required for correct logout.
  try {
    const endpoint = (await oidc.getConfig()).serverMetadata().end_session_endpoint;
    if (typeof endpoint !== "string" || endpoint.length === 0) {
      return null;
    }
    if (hint === null) {
      // No hint ⇒ BARE. Not "hint omitted, redirect kept" — that shape is the #437 regression.
      return endpoint;
    }
    const url = new URL(endpoint);
    url.searchParams.set(ID_TOKEN_HINT_PARAM, hint);
    const returnTo = postLogoutRedirectUri(headers, transport, oidc.redirectAllowlist);
    if (returnTo !== null) {
      url.searchParams.set(POST_LOGOUT_REDIRECT_PARAM, returnTo);
    }
    return url.href;
  } catch {
    return null;
  }
}

/** The `domain/sessions` slice the mint routes consume (the seam owns resolution; this is the write side). */
export interface AuthSessionsPort {
  readonly create: (params: {
    readonly userId: UserId;
    readonly userAgent?: string | null;
    /** #141 — the verified OIDC id_token, supplied by the callback ONLY. The verb seals it at rest (AAD =
     *  the new session row id); this route never reads it back. */
    readonly oidcIdToken?: string | null;
  }) => Promise<{ readonly token: SessionToken; readonly expiresAt: number }>;
  /** Returns WHICH session ended plus that session's OIDC end-session hint (`null` = already gone) so the
   *  route can evict that session's sockets and build the `id_token_hint` end-session URL (#141). */
  readonly revokeByToken: (token: SessionToken) => Promise<{ readonly sessionId: SessionId; readonly oidcIdToken: string | null } | null>;
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
 * W7a — THE SESSION-DEATH → SOCKET-DEATH EDGE, as a port.
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
      /** W7b — the upsert moved a field `sessions.me` projects (handle / role). See
       *  `ProvisionResult.identityChanged`; the callback fans `identityChanged` on this user's channel so
       *  their OTHER live devices re-read the viewer instead of rendering the pre-rename identity. */
      readonly identityChanged: boolean;
    }
  | { readonly outcome: "denied"; readonly reason?: ProvisionDenyReason };

/** Why the callback's `provisionIdentity` refused, where the route tells it apart: `account-exists` gets its
 *  own authError, and `jit-closed` alone may become a pending join (D254). */
type ProvisionDenyReason = "account-exists" | "jit-closed";

/**
 * B4 — the local-mode FIRST-RUN owner-password setup deps. Present ONLY in local mode; its presence registers
 * `POST /api/auth/first-run`. This is an UNAUTHENTICATED endpoint that sets the owner's initial password, so
 * it is guarded like the owner-fallback, not like a normal route:
 *   • `originAllowed` — the same gate the owner-fallback uses (`ownerFallbackAllowed`): a LOOPBACK TCP peer
 *     (the unspoofable socket, not the client `Host`) on a request with no relay tell, so a fresh deploy's
 *     first-run window is not reachable from the LAN, the public edge, or a same-host tunnel.
 *   • `setOwnerPassword` — the ONE-SHOT claim (hashes with the injected PasswordHasher, then the null-guarded
 *     `sessions.claimOwnerPassword`): returns the owner `UserId` iff it set a previously-null password, else
 *     `null` (already claimed). It can NEVER overwrite an existing owner credential — that is the admin-gated
 *     `resetPassword`'s job.
 */
export interface FirstRunRouteDeps {
  readonly setOwnerPassword: (plainPassword: string) => Promise<UserId | null>;
  /** True iff the raw TCP peer is loopback and the request carries no relay tell. */
  readonly originAllowed: (peerIp: string | undefined, headers: Headers) => boolean;
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
  /** #867 — the code→token exchange, injected so the callback's happy path is drivable without an IdP.
   *  Production wires `infra/auth`'s `createOidcExchange(authorizationCodeGrant)` — the real grant — at
   *  `entry/lifecycle.ts`. REQUIRED, deliberately: an optional dep would make "no exchange configured"
   *  a silently loginless OIDC box, and a defaulted one would let a mis-wired root fall back to
   *  something the operator never chose. */
  readonly exchange: OidcExchange;
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
  /** D254 — present when invites may create OIDC accounts; its presence makes the login carry `?invite=`, lets
   *  the callback offer a pending join, and registers the pending preview and confirm routes. */
  readonly signup?: OidcSignupDeps;
}

/** D254 — what the OIDC signup-through-invite routes need. */
interface OidcSignupDeps {
  readonly invites: Pick<SignupInviteOps, "tokenHashOf" | "admitsHash" | "previewHash" | "redeemPending" | "announceJoined">;
  readonly pending: Pick<SessionsService, "recordPendingSignup" | "readPendingSignup" | "preparePendingSignup">;
  /** Is this cookie token a live session? A signed-in caller joins through the in-app dialog, never here. */
  readonly sessionIsLive: (token: SessionToken) => Promise<boolean>;
  /** The new account's local-light floor, run after the commit (total by contract). */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
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
  /** The per-client throttled `session_minted_over_public_http` line, built on the composition root's clock.
   *  Absent, every such mint logs. */
  readonly publicHttpMintNotice?: PublicHttpMintNotice;
  /** D254 — present in local mode; registers the signup-through-invite route. */
  readonly signup?: SignupRouteDeps;
}

/** D254 — the local signup route's collaborators. Every op is injected: the route orders them and owns the
 *  cookie, and it never reads a table itself. */
export interface SignupRouteDeps {
  /** The deployment's multi-human capability, read per request; false answers 404 like `/join/:token`. */
  readonly multiHumanCapable: () => boolean;
  /** Is this cookie token a live session? A signed-in caller joins through the in-app dialog, never here. */
  readonly sessionIsLive: (token: SessionToken) => Promise<boolean>;
  /** Chat's signup ops: the invite pre-check, the one gated batch, and the join announcement. */
  readonly invites: Pick<SignupInviteOps, "admits" | "redeem" | "announceJoined">;
  /** The sessions front-door predicate over `OWNER_HANDLES` and the single-user placeholder, case-insensitive. */
  readonly isReservedHandle: (handle: Handle) => boolean;
  /** Does an account already carry the handle, case-insensitively? */
  readonly handleTaken: (handle: Handle) => Promise<boolean>;
  /** The scrypt password hasher bound to the `SESSION_SECRET` pepper. */
  readonly hashPassword: (plain: string) => Promise<string>;
  /** The new account's local-light floor, run after the commit (total by contract). */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
}

/** The over-budget response, IDENTICAL on both throttle axes (B1). Which belt fired is an OPERATOR signal
 *  (the distinct `securityEvent` names) and never a wire one: a body that named the axis would tell a
 *  brute-forcer whether to rotate IPs or rotate handles. Carries Retry-After when the limiter reports one. */
function throttledResponse(c: Context, err: DomainRateLimitError): Response {
  if (err.msBeforeNext !== undefined) {
    c.header("Retry-After", String(Math.max(1, Math.ceil(err.msBeforeNext / MS_PER_SECOND))));
  }
  return c.json({ error: "too many attempts; try again shortly" }, TOO_MANY_REQUESTS);
}

/** Consume one login-throttle point for the caller address; returns a 429 Response when over budget, else null
 *  (proceed). Keyed on the peer-first `clientIp` the ingress gate + tRPC seam share (no drift), grouped by
 *  `addressThrottleKey` so an IPv6 host cannot reset its bucket by rotating inside its /64 (D254). */
async function throttleLogin(limiter: RateLimiter, c: Context): Promise<Response | null> {
  const ip = clientIp(c);
  try {
    await limiter.consume(ip === null ? UNKNOWN_IP_KEY : addressThrottleKey(ip));
    return null;
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      securityEvent("login_throttled", { clientIp: clientIp(c) }, "security: login attempts over the per-IP throttle — 429");
      return throttledResponse(c, err);
    }
    throw err;
  }
}

/** B1 — the HANDLE-axis bucket key. The SAME normalization `sessions.authenticate` resolves the row with
 *  (`.trim()`, then a byte-exact `eq(users.handle, …)` against a BINARY-collated column), or a brute-forcer
 *  dodges the whole axis by padding a space onto every attempt. Length-bounded (see `HANDLE_KEY_MAX_CHARS`). */
function handleThrottleKey(rawHandle: string): string {
  return rawHandle.trim().slice(0, HANDLE_KEY_MAX_CHARS);
}

/** B1 — consume one point on the HANDLE axis; 429 when that account is over budget, else null. Runs BESIDE
 *  the per-IP consume (both must pass) and, like it, BEFORE `authenticate` — a throttle that let the KDF run
 *  first would have already tested the attacker's guess. */
async function throttleLoginHandle(limiter: RateLimiter, c: Context, handleKey: string): Promise<Response | null> {
  try {
    await limiter.consume(handleKey);
    return null;
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      securityEvent(
        "login_handle_throttled",
        { handle: handleKey, clientIp: clientIp(c) },
        "security: login attempts against ONE handle over the per-handle throttle (a distributed brute force, or a targeted flood of the account) — 429",
      );
      return throttledResponse(c, err);
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

/** B1 — the per-HANDLE login throttle (the SAME shared `rate_limit_buckets` table, its own `login-handle`
 *  scope so the two axes never share a bucket). The cap is the resolved `AppSettings.rateLimits.login` times
 *  {@link LOGIN_HANDLE_LIMIT_MULTIPLIER}, read FRESH per attempt like the per-IP one — one admin knob moves
 *  both belts together. Only the login route mints one: `first-run` carries no handle (it is the owner
 *  password-set) and stays IP-only. */
function loginHandleThrottler(deps: AuthRoutesDeps): RateLimiter {
  return createRateLimiter(deps.db, {
    scope: LOGIN_HANDLE_RATE_SCOPE,
    points: () => deps.resolveLoginLimit() * LOGIN_HANDLE_LIMIT_MULTIPLIER,
    windowMs: LOGIN_WINDOW_MS,
    now: deps.now,
  });
}

/**
 * The CSRF belt for the FORM-encoded mint routes (login + first-run). Both read a CORS-SIMPLE body
 * (`parseBody` → application/x-www-form-urlencoded / multipart), so entry/app.ts's JSON-only tRPC content-type
 * belt never reaches them — a cross-site `<form>` auto-POST arrives here with no preflight and no CORS grant.
 * Without this belt that is a CSRF: login-CSRF logs the victim into the ATTACKER's account, and first-run CSRF
 * sets the owner password (the loopback-peer gate does NOT stop that class — the owner's OWN browser is a
 * loopback peer, so a cross-origin page the owner visits satisfies it). Require the custom `x-orb-csrf` header
 * a cross-site page cannot set without a preflight this app never grants — the SAME belt logout uses (spine
 * invariant #9). Runs as a route belt BEFORE the handler, so a CSRF-less request is refused before any
 * throttle / origin gate / body parse / scrypt work. The same-origin client always sends it
 * (data/auth-bootstrap.ts login + firstRunSetup).
 */
const csrfGuard: MiddlewareHandler = (c, next) =>
  hasCsrfHeader(c.req.raw.headers) ? next() : Promise.resolve(c.json({ error: "missing CSRF header" }, FORBIDDEN));

/** Register `POST /api/auth/login` (local mode only): CSRF belt → body cap → per-IP throttle → per-HANDLE
 *  throttle → verify → mint cookie. The two throttle axes are independent and BOTH must pass (B1). */
function registerLoginRoute(app: Hono, deps: AuthRoutesDeps, authenticate: LocalAuthenticator): void {
  // Body-limit belt runs first so a huge POST is rejected before the body buffers; the throttles then cap
  // brute-force + scrypt-CPU-flood.
  const loginLimiter = loginThrottler(deps);
  const handleLimiter = loginHandleThrottler(deps);
  app.post(LOGIN_ROUTE, csrfGuard, bodyLimit({ maxSize: LOGIN_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    // CSRF is enforced by the `csrfGuard` belt above (spine invariant #9) — it runs before this handler (and
    // before the body is buffered), so a cross-site form-POST is refused before the throttle / scrypt work here.
    // The IP axis stays FIRST — it is the cheaper decision (no body parse) and it is the one that caps the
    // scrypt-CPU flood from a single source.
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
    // B1 — the handle axis, AFTER the presence check (a credential-less probe mints no bucket) and BEFORE
    // `authenticate` (a throttle that ran after the KDF would have already tested the guess).
    const handleThrottled = await throttleLoginHandle(handleLimiter, c, handleThrottleKey(handle));
    if (handleThrottled !== null) {
      return handleThrottled;
    }
    const userId = await authenticate(castId<Handle>(handle), password);
    if (userId === null) {
      return c.json({ error: "invalid credentials" }, UNAUTHORIZED);
    }
    const session = await deps.sessions.create({
      userId,
      userAgent: c.req.header("user-agent") ?? null,
    });
    writeMintedSession(c, deps, session);
    return c.json({ ok: true });
  });
}

/** B4 — register `POST /api/auth/first-run` (local mode only): CSRF belt → origin gate → body cap → per-IP
 *  throttle → min-length → ONE-SHOT owner-password claim → mint cookie. Guarded like the owner-fallback (see
 *  {@link FirstRunRouteDeps}): only reachable from a local/trusted origin, and it can never overwrite an
 *  owner credential that is already set (the claim is null-guarded and atomic). The CSRF belt is NOT redundant
 *  with the peer gate — the owner's own browser is a loopback peer, so only the header stops a cross-origin
 *  page the owner visits from driving the owner-password set (see {@link csrfGuard}). */
function registerFirstRunRoute(app: Hono, deps: AuthRoutesDeps, firstRun: FirstRunRouteDeps): void {
  const limiter = loginThrottler(deps);
  app.post(FIRST_RUN_ROUTE, csrfGuard, bodyLimit({ maxSize: LOGIN_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    // Peer gate FIRST: an unauthenticated password-set must never be reachable off-box (owner-fallback
    // parity: the LOOPBACK TCP peer, not the client `Host`, and never a relayed request, which is what a
    // same-host tunnel delivers over loopback). A LAN/public local deploy sets LOCAL_INITIAL_PASSWORD instead.
    if (!firstRun.originAllowed(peerIp(c), c.req.raw.headers)) {
      securityEvent(
        "first_run_origin_rejected",
        { peerIp: peerIp(c) ?? null },
        "security: first-run owner-password setup from a non-loopback peer or a relayed request — rejecting (set LOCAL_INITIAL_PASSWORD for a LAN, proxied or public local deploy)",
      );
      return c.json({ error: "first-run setup is only available on this machine, not through a proxy or tunnel" }, FORBIDDEN);
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
    writeMintedSession(c, deps, session);
    return c.json({ ok: true });
  });
}

/** D254 — one signup refusal on the wire: a fixed code, never a message that could name which gate fired. */
function signupRefusal(c: Context, code: SignupErrorCode, status: typeof BAD_REQUEST | typeof CONFLICT | typeof NOT_FOUND): Response {
  return c.json({ error: code }, status);
}

/** D254 — one point on the per-invite axis, keyed on the invite id the pre-check resolved; 429 when over. */
async function throttleSignupInvite(limiter: RateLimiter, c: Context, inviteId: string): Promise<Response | null> {
  try {
    await limiter.consume(inviteId);
    return null;
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      securityEvent(
        "signup_invite_throttled",
        { inviteId, clientIp: clientIp(c) },
        "security: signup attempts against ONE invite over the per-invite throttle — 429",
      );
      return throttledResponse(c, err);
    }
    throw err;
  }
}

/** D254 — does the request already carry a live session under its transport's cookie name? */
async function carriesLiveSession(c: Context, signup: SignupRouteDeps): Promise<boolean> {
  const token = readSessionCookie(c.req.raw.headers, requestTransport(c));
  return token !== null && (await signup.sessionIsLive(token));
}

/** D254 — the strict body parse. A body that is not JSON reads as an invalid request, like a schema miss. */
async function readSignupRequest(c: Context): Promise<ReturnType<typeof signupRequestSchema.safeParse>> {
  let raw: unknown;
  // @orb-waive caught-failure-ownership(catch): the CLIENT is the owner and the 400 is the surface — an unparseable body is the caller's error, answered with the same `invalid_request` code as a schema miss. Ends if body decoding gains a server-side fault worth distinguishing from bad input.
  try {
    raw = await c.req.json();
  } catch {
    raw = undefined;
  }
  return signupRequestSchema.safeParse(raw);
}

/**
 * D254 — register `POST /api/auth/signup` (local mode): a signed-out visitor creates an account through a
 * signup invite. The control order is ruled and each step stops the ones after it, so keep it: CSRF header,
 * body cap, the multi-human 404, the per-address bucket, a live session refused, the strict schema and the
 * password floor, the invite pre-check (a 404 with no invite bucket and no scrypt), the per-invite bucket,
 * reserved and taken handles, scrypt, the one gated batch, and only then the session cookie, the account's
 * vector floor and the join announcement. The cookie is written only for a batch whose every RETURNING
 * came back, so a refused or partial signup never leaves a session.
 */
function registerSignupRoute(app: Hono, deps: AuthRoutesDeps, signup: SignupRouteDeps): void {
  const addressLimiter = loginThrottler(deps);
  const inviteLimiter = createRateLimiter(deps.db, {
    scope: SIGNUP_INVITE_RATE_SCOPE,
    points: () => deps.resolveLoginLimit(),
    windowMs: LOGIN_WINDOW_MS,
    now: deps.now,
  });
  app.post(SIGNUP_ROUTE, csrfGuard, bodyLimit({ maxSize: LOGIN_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    const request = await admitSignupRequest(c, signup, addressLimiter);
    if (request instanceof Response) {
      return request;
    }
    const handle = castId<Handle>(request.handle);
    const refusal = await admitSignupAttempt(c, signup, inviteLimiter, { token: request.token, handle });
    if (refusal !== null) {
      return refusal;
    }
    const outcome = await signup.invites.redeem({ token: request.token, handle, passwordHash: await signup.hashPassword(request.password) });
    if (outcome.outcome === "refused") {
      return outcome.reason === "handle-taken" ? signupRefusal(c, "handle_unavailable", CONFLICT) : signupRefusal(c, "invite_unavailable", NOT_FOUND);
    }
    const session = await deps.sessions.create({ userId: outcome.userId, userAgent: c.req.header("user-agent") ?? null });
    writeMintedSession(c, deps, session);
    await signup.seedUserConnections(outcome.userId);
    await signup.invites.announceJoined(outcome.chatId);
    return c.json({ ok: true });
  });
}

/** D254 — the signup steps before any invite work: the multi-human 404, the per-address bucket, the live-session
 *  refusal, the strict schema and the password floor. Returns the parsed request, or the refusal to send. */
async function admitSignupRequest(c: Context, signup: SignupRouteDeps, addressLimiter: RateLimiter): Promise<Response | SignupRequest> {
  if (!signup.multiHumanCapable()) {
    return c.body(null, NOT_FOUND);
  }
  const throttled = await throttleLogin(addressLimiter, c);
  if (throttled !== null) {
    return throttled;
  }
  if (await carriesLiveSession(c, signup)) {
    return signupRefusal(c, "already_signed_in", CONFLICT);
  }
  const parsed = await readSignupRequest(c);
  if (!parsed.success) {
    return signupRefusal(c, "invalid_request", BAD_REQUEST);
  }
  if (parsed.data.password.length < MIN_PASSWORD_LENGTH) {
    return signupRefusal(c, "weak_password", BAD_REQUEST);
  }
  return parsed.data;
}

/** D254 — the steps between the parse and scrypt: the invite pre-check (a 404 that spends no invite bucket),
 *  the per-invite bucket, and the reserved and taken handles. Returns the refusal to send, or null. */
async function admitSignupAttempt(
  c: Context,
  signup: SignupRouteDeps,
  inviteLimiter: RateLimiter,
  attempt: { readonly token: string; readonly handle: Handle },
): Promise<Response | null> {
  const inviteId = await signup.invites.admits(attempt.token);
  if (inviteId === null) {
    return signupRefusal(c, "invite_unavailable", NOT_FOUND);
  }
  const inviteThrottled = await throttleSignupInvite(inviteLimiter, c, inviteId);
  if (inviteThrottled !== null) {
    return inviteThrottled;
  }
  if (signup.isReservedHandle(attempt.handle) || (await signup.handleTaken(attempt.handle))) {
    return signupRefusal(c, "handle_unavailable", CONFLICT);
  }
  return null;
}

/** Register the auth mint routes on `app`. Logout is always present; local login / first-run / signup / OIDC
 *  are registered only when their injected op is supplied. */
export function registerAuthRoutes(app: Hono, deps: AuthRoutesDeps): void {
  const authenticate = deps.authenticate;
  if (authenticate !== undefined) {
    registerLoginRoute(app, deps, authenticate);
  }
  if (deps.firstRun !== undefined) {
    registerFirstRunRoute(app, deps, deps.firstRun);
  }
  if (deps.signup !== undefined) {
    registerSignupRoute(app, deps, deps.signup);
  }

  app.post(LOGOUT_ROUTE, async (c) => {
    // Logout revokes the session (state-changing), so require the CSRF header like every cookie mutation —
    // else a cross-site top-level POST (SameSite=Lax rides the cookie) could force-logout.
    if (!hasCsrfHeader(c.req.raw.headers)) {
      return c.json({ error: "missing CSRF header" }, FORBIDDEN);
    }
    // The SAME reader the seam authenticates with (entry/auth/seam.ts) — a second copy here could revoke a
    // different token than the one that authenticated the request, leaving the live session un-killable.
    const transport = requestTransport(c);
    const token = readSessionCookie(c.req.raw.headers, transport);
    // #141 — the ended session's OIDC end-session hint, held ONLY long enough to build the URL below. It is
    // scoped to this handler and reaches no log, no audit field, and no response field of its own.
    let endSessionHint: string | null = null;
    if (token !== null) {
      const ended = await deps.sessions.revokeByToken(token);
      // W7a — the revoke kills the COOKIE; this kills the STREAM the cookie already opened. Per SESSION (F4):
      // this device's sockets close and its reconnect 401s into the client recovery ladder, while the same
      // human's other devices keep theirs. `null` = the row was already revoked, so there is nothing here to
      // have opened a socket that this call ends — and no hint either, since the winning revoke consumed it.
      if (ended !== null) {
        deps.sockets.evictSession(ended.sessionId);
        endSessionHint = ended.oidcIdToken;
      }
    }
    writeSetCookies(c, serializeClearedSessionCookies());
    // #141 — this body can now carry the session's `id_token_hint` inside the end-session URL, so it is a
    // token-bearing response. POSTs are not cached by default, but say so explicitly rather than relying on
    // that: no shared cache, no disk copy, no back-button replay of a hint the row no longer holds.
    c.header("Cache-Control", "no-store");
    // A6 — surface the IdP end-session URL so the client can end the UPSTREAM SSO session after the local
    // revoke (else "sign out → Continue" logs straight back in). Best-effort + null when there is no oidc
    // config or the issuer exposes no end_session_endpoint. The local session is already dead regardless.
    return c.json({ endSessionUrl: await resolveEndSessionUrl(deps.oidc, endSessionHint, c.req.raw.headers, transport) }, OK);
  });

  const oidc = deps.oidc;
  if (oidc !== undefined) {
    registerOidcRoutes(app, deps, oidc);
  }
}

/** Write the Set-Cookie headers for a freshly minted session (Max-Age from the expiry minus the injected
 *  clock): the request transport's cookie plus a clear of the other name. A mint over plain http for a public
 *  client sent a password or an IdP code and now a session cookie in clear, so it logs a security line (the
 *  owner ruled warn, not refuse). */
function writeMintedSession(c: Context, deps: AuthRoutesDeps, session: { readonly token: SessionToken; readonly expiresAt: number }): void {
  const transport = requestTransport(c);
  writeSetCookies(c, serializeMintedSessionCookies(session.token, transport, (session.expiresAt - deps.now()) / MS_PER_SECOND));
  if (transport === "http" && requestClientScope(c) === "public") {
    (deps.publicHttpMintNotice ?? reportPublicHttpMint)(clientIp(c));
  }
}

/**
 * Derive the OIDC callback redirect_uri from the request origin and accept it only when it exact-matches
 * the allowlist — never reflect an attacker-supplied origin blindly. The scheme IS the request transport
 * (`infra/auth/transport.ts`), so the callback and the session cookie cannot disagree: a proxy that asserts
 * no https derives an http callback, which only an `http://` allowlist entry the operator wrote can match.
 * X-Forwarded-Host is trusted here because the allowlist is the real gate. Off-allowlist ⇒ null.
 */
export function deriveRedirectUri(headers: Headers, transport: RequestTransport, allowlist: readonly string[]): string | null {
  const rawHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = rawHost !== undefined && rawHost !== "" ? rawHost : headers.get("host");
  if (host === null || host.length === 0) {
    return null;
  }
  const candidate = `${transport}://${host}${OIDC_CALLBACK_ROUTE}`;
  return allowlist.includes(candidate) ? candidate : null;
}

/** The OIDC authorize-redirect + callback handlers (openid-client v6). */
function registerOidcRoutes(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps): void {
  app.get(OIDC_LOGIN_ROUTE, async (c) => {
    const transport = requestTransport(c);
    const redirectUri = deriveRedirectUri(c.req.raw.headers, transport, oidc.redirectAllowlist);
    if (redirectUri === null) {
      securityEvent(
        "oidc_redirect_uri_rejected",
        {
          transport,
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
      inviteTokenHash: inviteTokenHashOf(c, oidc),
    });
    writeSetCookies(c, [serializeOidcBindingCookie(state, transport)]);
    const url = buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: oidc.scope,
      code_challenge: codeChallenge,
      code_challenge_method: PKCE_METHOD,
      state,
      nonce,
    });
    return c.redirect(url.href, FOUND);
  });

  // W7b — an IdP RENAME or a login-time role RE-DERIVE reaches this human's OTHER live devices here, or
  // nowhere: at `staleTime: Infinity` a warm tab elsewhere never re-reads `sessions.me` on its own. Called
  // BEFORE the cookie mint — the new device has no socket yet, so this is entirely about the sessions already
  // live, and nothing after it can fail in a way that should swallow the announcement. Extracted rather than
  // inlined so the callback stays under the cognitive-complexity gate (it was at 15 of 15).
  const fanIdentityChange = (provisioned: Extract<ProvisionOutcome, { outcome: "provisioned" }>): void => {
    if (provisioned.identityChanged) {
      publishUserEvent(provisioned.userId, { type: "identityChanged" });
    }
  };

  // The callback's tail once a usable identity exists: provision, then refuse, hold as a pending join, or mint.
  const provisionAndMint = async (
    c: Context,
    login: { readonly identity: ResolvedIdentity & { readonly externalId: ExternalId }; readonly tx: OidcTransaction; readonly idToken: string | null },
  ): Promise<Response> => {
    // A1/A2 — the OIDC caller resolves admission from env and hands the verb resolved booleans (it stays
    // mode-agnostic). forward-header never routes here, so its JIT is unaffected.
    const provisioned = await deps.sessions.provisionIdentity(login.identity, {
      allowJitProvision: oidc.allowJitProvision,
      requireApproval: oidc.requireApproval,
    });
    if (provisioned.outcome === "denied") {
      // D254 — the JIT gate, and only the JIT gate, may turn into a pending join when a signup invite rode in.
      const pending = provisioned.reason === "jit-closed" ? await offerPendingJoin(c, oidc, login) : null;
      // MS-W1 — a collision deny gets its own operator-actionable code; every other refusal is generic.
      return pending ?? loginErrorRedirect(c, oidcDenyErrorCode(provisioned.reason));
    }
    if (!provisioned.enabled) {
      return loginErrorRedirect(c, AUTH_ERROR_ACCOUNT_DISABLED);
    }
    fanIdentityChange(provisioned);
    const session = await deps.sessions.create({
      userId: provisioned.userId,
      userAgent: c.req.header("user-agent") ?? null,
      // #141 — the verified id_token rides into the session row (sealed by the verb) so THIS session's own
      // logout can present it as `id_token_hint`. An IdP that omitted it degrades to a bare end-session URL.
      oidcIdToken: login.idToken,
    });
    writeMintedSession(c, deps, session);
    return c.redirect("/", FOUND);
  };

  // A7 — the callback is a TOP-LEVEL browser navigation, so every failure lands back on /login with a
  // sanitized ?authError= code (never raw JSON in the address bar). The codes are already sanitized (fixed
  // literals or `sanitizeOidcErrorCode` output), so this widens no leak surface over the prior 401/403 JSON.
  app.get(OIDC_CALLBACK_ROUTE, async (c) => {
    const incoming = new URL(c.req.url);
    const tx = await consumeBoundTransaction(c, oidc.store, incoming.searchParams.get("state") ?? "");
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
    const exchange = await exchangeCodeForClaims(oidc.exchange, config, callbackUrl, tx);
    if (!exchange.ok) {
      securityEvent(
        "oidc_token_exchange_failed",
        { error: exchange.code },
        "security: OIDC code→token exchange failed (replay/expiry/mismatch/transient) — no session minted",
      );
      return loginErrorRedirect(c, exchange.code);
    }
    // #699 — the usable-identity gate refuses both no-username AND no-stable-subject logins (`oidcSessionIdentity`).
    const identity = oidcSessionIdentity(exchange.claims, oidc.claims, oidc.groupsSeparator);
    if (identity === null) {
      return loginErrorRedirect(c, AUTH_ERROR_NO_IDENTITY);
    }
    return await provisionAndMint(c, { identity, tx, idToken: exchange.idToken });
  });

  if (oidc.signup !== undefined) {
    registerOidcPendingJoin(app, deps, oidc, oidc.signup);
  }

  // A5 — RP back-channel logout. Registered only when OIDC_BACKCHANNEL_LOGOUT=on (deps.backchannelLogout set).
  // The IdP calls this server-to-server; the signed logout_token IS the authentication (no cookie, no CSRF).
  if (oidc.backchannelLogout !== undefined) {
    registerBackchannelLogout(app, deps, oidc, oidc.backchannelLogout);
  }
}

/** D254 — the peppered hash of a login's `?invite=`, or null. The route never says whether the invite is valid:
 *  an absent, over-long or unknown token mints the same transaction and the same redirect. The raw token is
 *  hashed here and never stored or logged. */
function inviteTokenHashOf(c: Context, oidc: OidcRoutesDeps): string | null {
  const raw = new URL(c.req.url).searchParams.get(INVITE_PARAM);
  if (oidc.signup === undefined || raw === null || raw.length === 0 || raw.length > INVITE_PARAM_MAX_CHARS) {
    return null;
  }
  return oidc.signup.invites.tokenHashOf(raw);
}

/** D254 — the pending-join cookie holding a fresh secret, alive exactly as long as the pending row. */
function serializePendingJoinCookie(secret: string, transport: RequestTransport): string {
  const { name, attrs } = oidcPendingJoinCookieFor(transport);
  return `${name}=${secret}; Max-Age=${OIDC_PENDING_JOIN_TTL_MS / MS_PER_SECOND}; ${attrs}`;
}

/** Clear every pending-join name (the logout pattern: the `__Host-` clear is dropped over plain http). */
function serializeClearedPendingJoinCookies(): readonly string[] {
  return OIDC_PENDING_JOIN_COOKIES.map(({ name, attrs }) => `${name}=; Max-Age=0; ${attrs}`);
}

/**
 * D254 — a JIT-closed identity that signed in with a signup invite gets a pending join instead of a refusal,
 * but only while the invite still admits one account under this mode and its minter still holds the
 * authority. Nothing is provisioned: the identity is frozen under a fresh secret that rides only the pending
 * cookie, and the browser lands on the pending surface, whose URL carries no secret. Returns null (the
 * caller refuses as before) when there is no signup path.
 */
async function offerPendingJoin(
  c: Context,
  oidc: OidcRoutesDeps,
  login: { readonly identity: ResolvedIdentity & { readonly externalId: ExternalId }; readonly tx: OidcTransaction; readonly idToken: string | null },
): Promise<Response | null> {
  const { signup } = oidc;
  const inviteTokenHash = login.tx.inviteTokenHash;
  if (signup === undefined || inviteTokenHash === null || !(await signup.invites.admitsHash(inviteTokenHash))) {
    return null;
  }
  const secret = await signup.pending.recordPendingSignup({ identity: login.identity, inviteTokenHash, idToken: login.idToken });
  writeSetCookies(c, [serializePendingJoinCookie(secret, requestTransport(c))]);
  getLog().info(
    { handle: login.identity.handle, externalId: login.identity.externalId },
    "auth: OIDC login held as a pending join (JIT closed, signup invite)",
  );
  return c.redirect(OIDC_PENDING_JOIN_SURFACE, FOUND);
}

/** D254 — one pending-join refusal on the wire: a fixed code, and the pending cookie cleared with it. */
function pendingJoinRefusal(c: Context, code: PendingJoinErrorCode, status: typeof BAD_REQUEST | typeof CONFLICT | typeof NOT_FOUND): Response {
  writeSetCookies(c, serializeClearedPendingJoinCookies());
  return c.json({ error: code }, status);
}

/** D254 — the raw pending secret under the request transport's name, or null. */
function pendingJoinSecret(c: Context): string | null {
  const secret = readRequestCookie(c.req.raw.headers, oidcPendingJoinCookieFor(requestTransport(c)).name);
  return secret !== null && secret.length > 0 ? secret : null;
}

/** D254 — the confirm's steps before any write: the per-address bucket, the live-session refusal, the strict
 *  empty body, and the pending secret. Returns the secret, or the refusal to send. */
async function admitPendingConfirm(c: Context, signup: OidcSignupDeps, addressLimiter: RateLimiter): Promise<Response | string> {
  const throttled = await throttleLogin(addressLimiter, c);
  if (throttled !== null) {
    return throttled;
  }
  const token = readSessionCookie(c.req.raw.headers, requestTransport(c));
  if (token !== null && (await signup.sessionIsLive(token))) {
    return c.json({ error: "already_signed_in" satisfies PendingJoinErrorCode }, CONFLICT);
  }
  let raw: unknown;
  // @orb-waive caught-failure-ownership(catch): the CLIENT is the owner and the 400 is the surface — an unparseable body is the caller's error, answered with the same `invalid_request` code as a schema miss. Ends if body decoding gains a server-side fault worth distinguishing from bad input.
  try {
    raw = await c.req.json();
  } catch {
    raw = undefined;
  }
  if (!pendingJoinConfirmRequestSchema.safeParse(raw).success) {
    return c.json({ error: "invalid_request" satisfies PendingJoinErrorCode }, BAD_REQUEST);
  }
  return pendingJoinSecret(c) ?? pendingJoinRefusal(c, "join_unavailable", NOT_FOUND);
}

/**
 * D254 — the signed-out pending join's two routes, both same-origin POSTs behind `csrfGuard`. The preview shows
 * the room the pending invite opens and nothing else. The confirm takes no token input: the pending cookie
 * names the join, `preparePendingSignup` re-decides the frozen identity, and chat's one batch takes the pending
 * row, inserts the account, spends a use, seats it and audits it, or does none of that. A session mints only
 * after that batch, and only for an enabled account: under OIDC_REQUIRE_APPROVAL the account waits disabled.
 */
function registerOidcPendingJoin(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps, signup: OidcSignupDeps): void {
  const addressLimiter = loginThrottler(deps);
  const bodyCap = bodyLimit({ maxSize: LOGIN_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) });
  app.post(OIDC_PENDING_PREVIEW_ROUTE, csrfGuard, bodyCap, async (c) => {
    const throttled = await throttleLogin(addressLimiter, c);
    if (throttled !== null) {
      return throttled;
    }
    const secret = pendingJoinSecret(c);
    const pending = secret === null ? null : await signup.pending.readPendingSignup(secret);
    const preview = pending === null ? null : await signup.invites.previewHash(pending.inviteTokenHash);
    if (preview === null) {
      return pendingJoinRefusal(c, "join_unavailable", NOT_FOUND);
    }
    return c.json(invitePreviewSchema.parse(preview));
  });
  app.post(OIDC_PENDING_CONFIRM_ROUTE, csrfGuard, bodyCap, async (c) => {
    const secret = await admitPendingConfirm(c, signup, addressLimiter);
    if (secret instanceof Response) {
      return secret;
    }
    const plan = await signup.pending.preparePendingSignup({ secret, requireApproval: oidc.requireApproval });
    if (plan === null) {
      return pendingJoinRefusal(c, "join_unavailable", NOT_FOUND);
    }
    const outcome = await signup.invites.redeemPending({
      tokenHash: plan.inviteTokenHash,
      userId: plan.userId,
      handle: plan.handle,
      statements: plan.statements,
    });
    if (outcome.outcome === "refused") {
      return outcome.reason === "handle-taken" ? pendingJoinRefusal(c, "account_exists", CONFLICT) : pendingJoinRefusal(c, "join_unavailable", NOT_FOUND);
    }
    writeSetCookies(c, serializeClearedPendingJoinCookies());
    if (plan.enabled) {
      const session = await deps.sessions.create({ userId: outcome.userId, userAgent: c.req.header("user-agent") ?? null, oidcIdToken: plan.oidcIdToken });
      writeMintedSession(c, deps, session);
    }
    await signup.seedUserConnections(outcome.userId);
    await signup.invites.announceJoined(outcome.chatId);
    return c.json({ signedIn: plan.enabled });
  });
}

/** A5 — POST /api/auth/oidc/backchannel-logout. Validates the IdP `logout_token` against the issuer JWKS
 *  (the full OIDC BCL §2.4 checklist lives in `infra/auth/backchannel`), then revokes every session row for
 *  the subject. A verified sid-only token is refused until session rows persist issuer+sid — accepting one
 *  without an actionable key would tell the IdP logout succeeded while leaving the session live. Returns
 *  200 on success, 400 on validation or unsupported-token failure (per spec), always no-store.
 *  Idempotent — a re-delivered token re-revokes nothing (no Redis replay cache needed). */
function registerBackchannelLogout(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps, bcl: NonNullable<OidcRoutesDeps["backchannelLogout"]>): void {
  app.post(
    OIDC_BACKCHANNEL_LOGOUT_ROUTE,
    bodyLimit({ maxSize: OIDC_BACKCHANNEL_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }),
    async (c) => {
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
      if (subject.sub === null) {
        securityEvent(
          "oidc_backchannel_sid_unsupported",
          { hasSid: subject.sid !== null },
          "security: OIDC back-channel logout — refused sid-only token because sessions have no issuer/sid binding",
        );
        return c.json({ error: "unsupported_logout_token" }, BAD_REQUEST);
      }

      const { revoked, userIds } = await deps.sessions.revokeByExternalId(castId<ExternalId>(subject.sub));
      // W7a — per USER here, not per session: the IdP has ended the HUMAN's login, and one subject can be
      // bound to more than one row. Idempotent with the revoke itself — a re-delivered logout token names no
      // users and evicts nothing.
      for (const userId of userIds) {
        deps.sockets.evictUser(userId);
      }
      securityEvent("oidc_backchannel_logout", { revoked }, "security: OIDC back-channel logout — revoked all sessions for the subject");
      return c.body(null, OK);
    },
  );
}

/** THE group-name normalisation, shared by both claim shapes (#1478 item 4): trim each name, drop the
 *  empties. It is ONE function because the CONFIG side is trimmed everywhere it is parsed (`csv()` for
 *  OIDC_ADMIN_GROUPS / OIDC_ALLOWED_GROUPS / OWNER_HANDLES, and `isOwnerByPolicy` for OWNER_GROUP) and the
 *  comparison against it is EXACT — so a name normalised on one side and not the other silently matches
 *  nothing. Trim only: no case folding, no prefix matching, because every one of those lists grants
 *  something. */
function cleanGroupNames(names: readonly string[]): string[] {
  return names.map((name) => name.trim()).filter((name) => name.length > 0);
}

/** A4 — parse the groups-claim VALUE. An array yields its string members; a single string is split on the
 *  configured separator (an authentik property mapping may emit a ';'-joined string) — a string with no
 *  separator is one group. Both shapes then go through {@link cleanGroupNames}. Anything else ⇒ []. Before
 *  A4, a joined string yielded [], which under `OIDC_ALLOWED_GROUPS` denied EVERY login (a fail-closed
 *  misconfiguration that reads like a broken IdP); before #1478 the ARRAY branch skipped the trim, so a
 *  padded member of an array-shaped claim matched no configured name either. */
function normalizeGroups(raw: unknown, separator: string): string[] {
  if (Array.isArray(raw)) {
    return cleanGroupNames(raw.filter((g): g is string => typeof g === "string"));
  }
  if (typeof raw === "string" && raw.length > 0) {
    return cleanGroupNames(raw.split(separator));
  }
  return [];
}

/**
 * The RAW groups-claim value's shape, as one greppable word — `undefined`/`null` (the IdP emitted nothing at
 * this claim path), `array`, `string`, or whatever else a misconfigured property mapping produced. A TYPE
 * name only: no claim VALUE and no other claim ever reaches a log line through here.
 */
function groupsClaimShape(raw: unknown): string {
  if (Array.isArray(raw)) {
    return "array";
  }
  return raw === null ? "null" : typeof raw;
}

/**
 * Whether the raw groups claim carries a value shape {@link normalizeGroups} can read — an array or a
 * string. `undefined`/`null` means the IdP emitted NOTHING at the configured claim path; any other type is a
 * broken property mapping. An EMPTY array/string is USABLE: a user legitimately in no groups is not a
 * misconfiguration, and treating it as one would make the signal a per-login siren.
 */
function groupsClaimIsUsable(raw: unknown): boolean {
  return Array.isArray(raw) || typeof raw === "string";
}

/**
 * #140 — THE ARRIVAL RECEIPT FOR THE `groups` CLAIM. Until this line existed the provisioning path logged
 * handle + externalId and never the claim that decides the ROLE, so "does authentik's `groups` actually ride
 * the token?" was unobservable on the box (the 2026-08-09 authentik crosscheck's open residual #2) — and
 * absence was indistinguishable from "present and empty" by the time it reached `provisionIdentity`, which
 * only ever sees the normalized `string[]`. THIS is the one place both facts are still in hand.
 *
 * One INFO line per OIDC login: the configured claim NAME (the knob to fix), whether a usable value arrived,
 * its raw shape, and the bounded group NAMES (`groupsLogFields` — names only; the ID token and the raw claim
 * object are never logged).
 *
 * Plus a securityEvent when the claim is UNUSABLE **and group governance is ACTIVE** — the same
 * silently-disabled-control class as `oidc_subject_claim_missing` (#34). With `OIDC_ADMIN_GROUPS` set that
 * login derives `user` for everyone (no admin is ever granted, and an existing group-derived admin is
 * DEMOTED by the login re-derive); with `OIDC_ALLOWED_GROUPS` set the fail-closed gate denies EVERY login.
 * Both read as "the IdP is broken" with nothing naming the cause. Gated on governance being active so a box
 * that never configured groups stays silent. OBSERVABILITY ONLY — the identity returned is byte-identical.
 */
function reportGroupsClaimArrival(raw: unknown, groups: readonly string[], claimName: string, handle: Handle): void {
  const usable = groupsClaimIsUsable(raw);
  const shape = groupsClaimShape(raw);
  getLog().info(
    { event: "oidc_groups_claim", handle, groupsClaim: claimName, groupsClaimPresent: usable, groupsClaimShape: shape, ...groupsLogFields(groups) },
    usable ? "auth: OIDC groups claim arrived" : "auth: OIDC groups claim ABSENT — the IdP emitted no usable value at this claim path",
  );
  if (usable || !groupRoleGovernanceActive()) {
    return;
  }
  securityEvent(
    "oidc_groups_claim_missing",
    { handle, groupsClaim: claimName, groupsClaimShape: shape },
    "security: group governance is ACTIVE (OIDC_ADMIN_GROUPS/OIDC_ALLOWED_GROUPS) but this login carried NO usable groups claim — no group can grant admin (and a group-derived admin is demoted on this login), and OIDC_ALLOWED_GROUPS denies everyone; point OIDC_GROUPS_CLAIM at a claim the IdP emits (authentik: `groups` rides the `profile` scope — check the provider's property mapping)",
  );
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
 *  `OIDC_UID_CLAIM` names a claim this IdP does not emit. This mapper is the oidc-only seam (forward-header
 *  resolves in `infra/auth/modes/forward-header.ts`), so the warn is mode-scoped by construction.
 *
 *  THE SECURITY EVENT IS OBSERVABILITY; THE REFUSAL LIVES AT THE CALLBACK (#699, 2026-08-25). This function
 *  still returns a byte-identical identity with or without the warn — it must, because it is a pure mapper and
 *  refusing here would conflate the diagnosis with the decision. But the box no longer "runs guard-less for
 *  every login": the OIDC callback that owns this mapper now refuses a null-`externalId` identity outright
 *  (fail-closed, oidc-only), so a misconfigured oidc box gets a denied login plus this tell, not a guard-less
 *  session. The refusal is at the callback rather than in the verb because only the callback KNOWS the mode —
 *  forward-header, where a null subject is legitimate, never routes through here or through that arm. */
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
  // Branded ONCE here, so the two observability calls below and the returned identity all speak about the
  // same `Handle` and no `string` sits in a name position (`brand-in-name-position`).
  const handle = castId<Handle>(username);
  const rawUid = readClaimPath(claims, claimMap.uidClaim);
  const uid = typeof rawUid === "string" && rawUid.length > 0 ? rawUid : null;
  if (uid === null) {
    securityEvent(
      "oidc_subject_claim_missing",
      { handle, uidClaim: claimMap.uidClaim },
      "security: an OIDC login carried no stable subject — OIDC_UID_CLAIM names a claim this IdP does not emit; the callback now REFUSES this login fail-closed (#699), so no session is minted and the bind-once takeover guard is never relied on, but every OIDC login stays locked out until this is fixed; point OIDC_UID_CLAIM at a claim the IdP emits (`sub` is required by OIDC Core)",
    );
  }
  const rawGroups = readClaimPath(claims, claimMap.groupsClaim);
  const groups = normalizeGroups(rawGroups, groupsSeparator);
  // #140 — the claim's ARRIVAL (or its absence) is recorded HERE, the last point at which "the IdP emitted
  // nothing" and "the IdP emitted an empty list" are still distinguishable; `ResolvedIdentity.groups` folds
  // both to `[]`.
  reportGroupsClaimArrival(rawGroups, groups, claimMap.groupsClaim, handle);
  const rawEmail = readClaimPath(claims, claimMap.emailClaim);
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;
  return {
    externalId: uid === null ? null : castId<ExternalId>(uid),
    handle,
    groups,
    email,
  };
}

/**
 * #699 — THE OIDC CALLBACK'S USABLE-IDENTITY GATE, fail-closed. Returns the mapped identity ONLY when it can
 * key a session, else `null`:
 *   • no usable username — `identityFromClaims` already returned `null` (no identity at all).
 *   • NO STABLE SUBJECT (`externalId === null`) — the #699 refusal. `externalId` is the identity key, and the
 *     bind-once takeover refusal (`isSubjectMismatch`, `domain/sessions/verbs/provision-identity`) is
 *     structurally inert for a null-subject login — it has no subject to contradict — so provisioning would
 *     fall through to a HANDLE match and authorize whatever row holds that handle, including one already bound
 *     to a DIFFERENT subject (impersonation-for-this-session; an IdP handle reassignment, or the
 *     publicly-guessable `OWNER_HANDLES` value, is the reach). `sub` is REQUIRED by OIDC Core and the token
 *     exchange (`oauth4webapi` validatePresence) already refuses an ID token without it, so a null subject here
 *     means `OIDC_UID_CLAIM` names a claim this IdP does not emit — a MISCONFIGURATION, never a legitimate
 *     login. The operator tell already fired inside `identityFromClaims` (`oidc_subject_claim_missing`).
 *
 * OIDC-SCOPED BY CONSTRUCTION, which is why this refusal is SAFE here and FORBIDDEN in the verb. This is the
 * oidc-only seam (the callback is registered only when `deps.oidc` is set = AUTH_MODE=oidc); forward-header
 * resolves identity in `infra/auth/modes/forward-header.ts` and never reaches it, so a null subject — the
 * NORMAL forward-header shape, where the proxy is the identity authority — is untouched. The verb must still
 * NOT widen its own guard to null (that breaks forward-header); the ruling survives, its INPUT changed — the
 * oidc half now fails closed one tier UP. See the residual note in `provision-identity.ts`.
 */
export function oidcSessionIdentity(
  claims: { readonly [claim: string]: unknown } | undefined,
  claimMap: OidcClaimMap,
  groupsSeparator?: string,
): (ResolvedIdentity & { readonly externalId: ExternalId }) | null {
  const identity = identityFromClaims(claims, claimMap, groupsSeparator);
  if (identity === null || identity.externalId === null) {
    return null;
  }
  return { ...identity, externalId: identity.externalId };
}
