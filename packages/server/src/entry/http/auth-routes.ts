// entry/http/auth-routes — the auth MINT routes + cookie I/O (core/Tier-5-Entry.md §layout "auth-routes.ts";
// spine Spine-Identity-and-Auth.md §3 "Construction"; cookie I/O is the route layer's job — the domain
// returns a token string). This is the WRITE side of the `__Host-orb_session` cookie — the READ side is the seam +
// `infra/auth` (`SESSION_COOKIE_NAME`, imported here so writer + reader agree on the ONE constant). It
// NEVER re-implements identity resolution: it mints sessions via `domain/sessions` (create / revokeByToken
// / provisionIdentity) and writes the cookie; resolution belongs to the seam.
//
// The cookie contract: `__Host-orb_session` ⇒ Secure + host-only + Path=/ + NO Domain +
// HttpOnly + SameSite=Lax (the `__Host-` prefix's browser-enforced trio is Secure + Path=/ + no Domain;
// SameSite=Lax + the custom CSRF header is the whole CSRF story — infra/auth/csrf.ts). Max-Age is derived
// from the session expiry minus the INJECTED `now` (determinism — no ambient clock).
//
// LOCAL login (`AUTH_MODE=local`): password-form → verify → `sessions.create` → set cookie.
//   The password VERIFY step is the injected `authenticate` port, supplied from the `domain/sessions`
//   `authenticate(handle, password)` verb (PD-83 resolved — the dummy-hash constant-time floor + the
//   disabled gate live in the verb; admin keeps the hash MINT side). The login route is registered ONLY
//   when the op is provided (non-local modes leave it inert — fail-closed).
//
// OIDC login (`AUTH_MODE=oidc`): the `openid-client` v6 client flow — discovery (cached) → PKCE +
//   state + nonce → buildAuthorizationUrl (redirect) → callback: consume the PKCE txn →
//   authorizationCodeGrant → claims → provisionIdentity → mint cookie.
//   The OIDC transaction store IS built (`domain/sessions/persistence/oidc-store.ts`, `oidc_transactions`
//   — mint at authorize + single-use consume at callback, with the `oidc-gc-scheduler` reaping expired
//   rows); the OIDC client config (issuer/clientId/clientSecret + OIDC_REDIRECT_URIS/OIDC_SCOPES + the
//   OIDC_*_CLAIM mapping) lives in `foundation/env` and is wired in at `entry/lifecycle`. The routes are
//   registered ONLY when the `OidcRoutesDeps` bundle is supplied (non-oidc modes leave them inert —
//   fail-closed). Claim NAMES are configurable (provider-agnostic; defaults are authentik's shape).
//
//   ORIGIN-FLEXIBLE CALLBACK: the redirect_uri is DERIVED per-request from the origin (X-Forwarded-Proto +
//   X-Forwarded-Host/Host) and accepted ONLY if it exact-matches the OIDC_REDIRECT_URIS allowlist — so
//   login works at the public FQDN AND at a LAN-IP/localhost origin, without ever reflecting an
//   attacker-supplied origin (open-redirect / CVE-2024-52289). The VALIDATED redirect_uri is stored in the
//   PKCE transaction and reconstructed at the callback so the token exchange presents the SAME redirect_uri
//   the IdP saw, even behind a proxy (where `c.req.url` carries the internal upstream host).

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { Configuration } from "openid-client";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
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

// ── Cookie I/O (pure; exported for the test mirror) ─────────────────────────────────────────────────────

/** Serialize the `__Host-orb_session` Set-Cookie value with a Max-Age (seconds; clamped ≥ 0). */
export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAge}; ${COOKIE_ATTRS}`;
}

/** Serialize the cleared (logout) Set-Cookie value — same name + attrs, empty value, Max-Age=0. */
export function serializeClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRS}`;
}

/** Read the opaque session token from the request `Cookie` header, or `null` (the same minimal parse the
 *  seam uses — our token is base64url, so a value that can't decode can't be ours). */
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

/** The `domain/sessions` slice the mint routes consume (the seam owns resolution; this is the WRITE side). */
export interface AuthSessionsPort {
  readonly create: (params: {
    readonly userId: UserId;
    readonly userAgent?: string | null;
  }) => Promise<{ readonly token: string; readonly expiresAt: number }>;
  readonly revokeByToken: (token: string) => Promise<void>;
  /** The upsert result the OIDC callback dispatches on — see {@link ProvisionOutcome}. */
  readonly provisionIdentity: (identity: ResolvedIdentity) => Promise<ProvisionOutcome>;
}

/** The `provisionIdentity` result the OIDC callback dispatches on: `provisioned` (mint the session, gating
 *  on `enabled`) or `denied` (the OIDC_ALLOWED_GROUPS login gate refused — 401, no session). A file-local,
 *  NON-exported structural mirror of the domain `ProvisionResult` (keeps the route decoupled from domain
 *  internals — no cross-tier import; the `no-inline-types` gate allows a non-exported local type). */
type ProvisionOutcome =
  | {
      readonly outcome: "provisioned";
      readonly userId: UserId;
      readonly enabled: boolean;
      readonly role: UserRole;
    }
  | { readonly outcome: "denied" };

/** Local password verification (handle + password → the resolved userId, or `null`) — supplied from
 *  `sessions.authenticate` (PD-83) by the composition root in local mode. */
export interface LocalAuthenticator {
  // biome-ignore lint/style/useShorthandFunctionType: the shorthand `export type X = (...) => ...` alias trips the no-inline-types rule's broad `export type` arm (entry/ is not a contract type home), so keep the call-signature interface and suppress the biome INFO instead.
  (handle: string, password: string): Promise<UserId | null>;
}

/** The OIDC transaction store the route needs — MINT (authorize) + CONSUME (callback). Wider than infra/auth's
 *  consume-only `OidcTransactionStore` because the authorize-redirect route also mints. Satisfied by
 *  `domain/sessions` `createOidcStore` (which ALSO reaps expired rows via `deleteExpired`, driven by the
 *  `transport/jobs/oidc-gc-scheduler` GC — not part of this route's surface). */
export interface OidcMintStore {
  readonly mint: (tx: OidcTransaction) => Promise<void>;
  readonly consume: (state: string) => Promise<OidcTransaction | null>;
}

/** The OIDC claim-NAME mapping (env OIDC_*_CLAIM) — provider-agnostic. Defaults to authentik's shape
 *  (`preferred_username` / `sub` / `groups` / `email`); Okta/Azure/Keycloak override without a code change.
 *  Any name may be a DOT-PATH for a nested claim (e.g. `user.memberOf`) — see `readClaimPath`. */
export interface OidcClaimMap {
  readonly usernameClaim: string;
  readonly uidClaim: string;
  readonly groupsClaim: string;
  readonly emailClaim: string;
}

/** The OIDC client deps — the `openid-client` config + the callback allowlist + scope + the claim mapping
 *  + the mint/consume store. Wired at entry/lifecycle in `oidc` mode. */
export interface OidcRoutesDeps {
  /** The `openid-client` discovery result (cached by the caller — one round-trip at boot). */
  readonly getConfig: () => Promise<Configuration>;
  /** The parsed OIDC_REDIRECT_URIS allowlist — the FULL callback URLs a derived origin must exact-match.
   *  Empty ⇒ every login 400s (fail-closed: no origin is permitted). */
  readonly redirectAllowlist: readonly string[];
  readonly scope: string;
  readonly claims: OidcClaimMap;
  readonly store: OidcMintStore;
}

export interface AuthRoutesDeps {
  readonly sessions: AuthSessionsPort;
  /** The injected clock (epoch-ms) — Max-Age is `expiresAt - now()`. No ambient `Date.now()` here. */
  readonly now: () => number;
  /** Present in `local` mode (else the login route is not registered). */
  readonly authenticate?: LocalAuthenticator;
  /** Present in `oidc` mode (else the OIDC routes are not registered). */
  readonly oidc?: OidcRoutesDeps;
}

/** Register the auth mint routes on `app`. Logout is always present; local login / OIDC are registered
 *  only when their injected op is supplied (the mode-conditional, fail-closed posture). */
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
function sessionCookieFor(
  session: { readonly token: string; readonly expiresAt: number },
  now: number,
): string {
  return serializeSessionCookie(session.token, (session.expiresAt - now) / MS_PER_SECOND);
}

/**
 * Derive the OIDC callback redirect_uri from the request origin (X-Forwarded-Proto + X-Forwarded-Host /
 * Host) and accept it ONLY when it exact-matches the allowlist — the open-redirect guard (never reflect an
 * attacker-supplied origin blindly; the CVE-2024-52289 class). The proto DEFAULTS to `https` and is NEVER
 * downgraded to http on an unknown origin: a direct plain-HTTP deploy that sets no X-Forwarded-Proto
 * derives an https candidate that won't match an http allowlist entry, so login 400s — intended (front the
 * app with TLS or a proxy that sets X-Forwarded-Proto). X-Forwarded-Host IS trusted here (a proxy
 * legitimately rewrites it to the public host) because the allowlist is the real gate — an off-list origin
 * is rejected regardless. Pure (no I/O) → unit-tested directly. Off-allowlist ⇒ null. Exported for the test. */
export function deriveRedirectUri(headers: Headers, allowlist: readonly string[]): string | null {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  if (host === null || host.length === 0) {
    return null;
  }
  const candidate = `${proto}://${host}${OIDC_CALLBACK_ROUTE}`;
  return allowlist.includes(candidate) ? candidate : null;
}

/** The OIDC authorize-redirect + callback handlers (openid-client v6). */
function registerOidcRoutes(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps): void {
  app.get(OIDC_LOGIN_ROUTE, async (c) => {
    // Derive + validate the callback origin BEFORE any IdP work: off-allowlist ⇒ 400, no transaction minted,
    // no discovery round-trip, no redirect leaked to the IdP.
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
    // Reconstruct the callback URL from the VALIDATED, stored redirect_uri (the public origin the IdP saw)
    // + the incoming query, so the token-exchange redirect_uri matches what the IdP received even behind a
    // proxy (where `c.req.url`'s host is the internal upstream). openid-client checks it against the code.
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
      // The OIDC_ALLOWED_GROUPS login gate refused this identity (in none of the allowed groups). 401 —
      // distinct from the disabled-account 403 below (fail-closed access, no session, no JIT row).
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

/** Resolve a claim NAME that may be a DOT-PATH (authentik/Entra/AD FS nested claims, e.g. `user.memberOf`,
 *  `resource_access.orb.roles`) against the claims object. A flat name (no dot) is a single-key lookup —
 *  fully backward-compatible. A literal dot in a claim key is treated as a path separator (the standard
 *  convention); the walk short-circuits to `undefined` at any non-object segment. Exported for the test. */
export function readClaimPath(
  claims: { readonly [claim: string]: unknown },
  path: string,
): unknown {
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
 *  is absent/empty (fail-closed point #4 — the spine refuses an identity with no handle). Claim NAMES are
 *  injected (`OidcClaimMap`, from OIDC_*_CLAIM) so a non-authentik IdP (Okta `upn`, Azure `oid`/`roles`,
 *  Keycloak) maps without a code change; defaults are authentik's `preferred_username`/`sub`/`groups`/`email`.
 *  Each name may be a nested dot-path (`readClaimPath`). `email` is a mutable attribute (null when absent).
 *  Exported for the unit test (like the cookie serializers above). */
export function identityFromClaims(
  claims: { readonly [claim: string]: unknown } | undefined,
  claimMap: OidcClaimMap,
): ResolvedIdentity | null {
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
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((g): g is string => typeof g === "string")
    : [];
  const rawEmail = readClaimPath(claims, claimMap.emailClaim);
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;
  return {
    externalId: uid === null ? null : castId<ExternalId>(uid),
    handle: castId<Handle>(username),
    groups,
    email,
  };
}
