// entry/http/auth-routes — the auth MINT routes + cookie I/O (tiers/entry.md §layout "auth-routes.ts";
// spine identity-auth-permission.md §3 "Construction"; sessions.md movement "cookie I/O is the route
// layer's job"). This is the WRITE side of the `__Host-orb_session` cookie — the READ side is the seam +
// `infra/auth` (`SESSION_COOKIE_NAME`, imported here so writer + reader agree on the ONE constant). It
// NEVER re-implements identity resolution: it mints sessions via `domain/sessions` (create / revokeByToken
// / provisionIdentity) and writes the cookie; resolution belongs to the seam.
//
// The cookie contract (sessions.md §11): `__Host-orb_session` ⇒ Secure + host-only + Path=/ + NO Domain +
// HttpOnly + SameSite=Lax (the `__Host-` prefix's browser-enforced trio is Secure + Path=/ + no Domain;
// SameSite=Lax + the custom CSRF header is the whole CSRF story — infra/auth/csrf.ts). Max-Age is derived
// from the session expiry minus the INJECTED `now` (determinism — no ambient clock).
//
// LOCAL login (`AUTH_MODE=local`): password-form → verify → `sessions.create` → set cookie.
//   DEFER(promotion): the password VERIFY step (handle+password → userId) is an injected `authenticate`
//   port. No domain verb resolves a local password today (sessions exposes create/validate/provision but
//   no `authenticate(handle,password)`; admin owns the hash MINT side only). The route logic + cookie I/O
//   are complete; the composition root cannot supply `authenticate` until a `domain/sessions` password-
//   resolution verb lands, so the login route is registered ONLY when the op is provided (inert otherwise).
//
// OIDC login (`AUTH_MODE=oidc`): the `openid-client` v6 client flow — discovery (cached) → PKCE +
//   state + nonce → buildAuthorizationUrl (redirect) → callback: consume the PKCE txn →
//   authorizationCodeGrant → claims → provisionIdentity → mint cookie.
//   DEFER(promotion): PD-5 — the OIDC transaction store (`domain/sessions/persistence/oidc-store.ts`,
//   `oidc_transactions`) is NOT built; `infra/auth`'s `OidcTransactionStore` declares only `consume`
//   (the verify side), with no MINT side for the authorize redirect. The OIDC client config
//   (issuer/clientId/clientSecret/redirectUri/scope) is also not yet in `foundation/env`/`AuthConfig`
//   (that type is verification-side only). So the OIDC routes are wired against the injected
//   `OidcRoutesDeps` bundle and registered ONLY when it is supplied (inert until PD-5 + the config land).

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

// ── Injected ports ──────────────────────────────────────────────────────────────────────────────────────

/** The `domain/sessions` slice the mint routes consume (the seam owns resolution; this is the WRITE side). */
export interface AuthSessionsPort {
  readonly create: (params: {
    readonly userId: UserId;
    readonly userAgent?: string | null;
  }) => Promise<{ readonly token: string; readonly expiresAt: number }>;
  readonly revokeByToken: (token: string) => Promise<void>;
  readonly provisionIdentity: (
    identity: ResolvedIdentity,
  ) => Promise<{ readonly userId: UserId; readonly enabled: boolean; readonly role: UserRole }>;
}

/** Local password verification (handle + password → the resolved userId, or `null`). DEFER(promotion):
 *  no `domain/sessions` verb provides this yet — see the file header. */
export interface LocalAuthenticator {
  (handle: string, password: string): Promise<UserId | null>;
}

/** The OIDC transaction store the route needs — MINT (authorize) + CONSUME (callback). DEFER(promotion):
 *  PD-5 — not built; `infra/auth`'s `OidcTransactionStore` is consume-only. */
export interface OidcMintStore {
  readonly mint: (tx: OidcTransaction) => Promise<void>;
  readonly consume: (state: string) => Promise<OidcTransaction | null>;
}

/** The OIDC client deps (DEFER(promotion): PD-5 + the config plumbing — unsuppliable today). */
export interface OidcRoutesDeps {
  /** The `openid-client` discovery result (cached by the caller — one round-trip at boot). */
  readonly getConfig: () => Promise<Configuration>;
  readonly redirectUri: string;
  readonly scope: string;
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

// ── Registrar ───────────────────────────────────────────────────────────────────────────────────────────

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

/** The OIDC authorize-redirect + callback handlers (openid-client v6). */
function registerOidcRoutes(app: Hono, deps: AuthRoutesDeps, oidc: OidcRoutesDeps): void {
  app.get(OIDC_LOGIN_ROUTE, async (c) => {
    const config = await oidc.getConfig();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();
    const nonce = randomNonce();
    await oidc.store.mint({
      state,
      codeVerifier,
      nonce,
      redirectUri: oidc.redirectUri,
      createdAt: deps.now(),
    });
    const url = buildAuthorizationUrl(config, {
      // biome-ignore lint/style/useNamingConvention: OAuth/OIDC authorization-request parameter names are wire-fixed (snake_case).
      redirect_uri: oidc.redirectUri,
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
    const tx = await oidc.store.consume(c.req.query("state") ?? "");
    if (tx === null) {
      return c.json({ error: "invalid or expired oidc state" }, UNAUTHORIZED);
    }
    const config = await oidc.getConfig();
    const tokens = await authorizationCodeGrant(config, new URL(c.req.url), {
      pkceCodeVerifier: tx.codeVerifier,
      expectedNonce: tx.nonce,
      expectedState: tx.state,
    });
    const identity = identityFromClaims(tokens.claims());
    if (identity === null) {
      return c.json({ error: "oidc token carried no usable identity" }, UNAUTHORIZED);
    }
    const provisioned = await deps.sessions.provisionIdentity(identity);
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

/** Map verified OIDC ID-token claims → a `ResolvedIdentity`, or `null` when no usable `preferred_username`
 *  is present (fail-closed point #4 — the spine refuses an identity with no handle). */
function identityFromClaims(
  claims: { readonly sub?: string; readonly [claim: string]: unknown } | undefined,
): ResolvedIdentity | null {
  if (claims === undefined) {
    return null;
  }
  const username = claims["preferred_username"];
  if (typeof username !== "string" || username.length === 0) {
    return null;
  }
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  const rawGroups = claims["groups"];
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((g): g is string => typeof g === "string")
    : [];
  return {
    externalId: sub === null ? null : castId<ExternalId>(sub),
    handle: castId<Handle>(username),
    groups,
  };
}
