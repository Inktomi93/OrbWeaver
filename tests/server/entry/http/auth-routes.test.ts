// entry/http/auth-routes — the auth mint routes + cookie I/O. Pins: the `__Host-orb_session` cookie shape
// (Secure + host-only + Path=/ + HttpOnly + SameSite=Lax; Max-Age from the injected clock); local login
// (verify → sessions.create → set cookie; 401/400 paths); logout (revoke + clear); and the mode-conditional
// registration (login present only with `authenticate`, OIDC present only with `oidc`). Hono isn't
// test-resolvable, so the registrar runs over a captured mock app + context.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RevokedSessionsSummary } from "@orb/server/domain/sessions";
import type { AuthRoutesDeps, AuthSessionsPort, LocalAuthenticator, OidcClaimMap, OidcRoutesDeps, SessionSocketEviction } from "@orb/server/entry/http";
import {
  deriveRedirectUri,
  identityFromClaims,
  oidcSessionIdentity,
  registerAuthRoutes,
  serializeClearedSessionCookies,
  serializeSessionCookie,
} from "@orb/server/entry/http";
import { logger } from "@orb/server/foundation/observability";
import type { OidcTransaction, OidcVerifiedTokens } from "@orb/server/infra/auth";
import { SESSION_COOKIE_NAME_INSECURE, SESSION_COOKIE_NAME_SECURE } from "@orb/server/infra/auth";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const THIRTY_DAYS_MS = 2_592_000_000;
const COOKIE = "__Host-orb_session";
/** The session row a logout ends — what `revokeByToken` reports and the route evicts sockets by (W7a). */
const REVOKED_SESSION_ID = castId<SessionId>("sess_logout");
/** #141 — what `revokeByToken` now reports: the ended row + the OIDC end-session hint it was carrying. */
interface RevokedSessionStub {
  readonly sessionId: SessionId;
  readonly oidcIdToken: string | null;
}
/** A compact ID-token stand-in. Its BYTES are the assertion (it must arrive verbatim as `id_token_hint`);
 *  no code under test parses it, so a real JWT would only add noise. */
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.e30.sig-not-verified-here";
/** For the deps literals whose test drives no revoke at all. */
const INERT_EVICTION: SessionSocketEviction = { evictSession: (): number => 0, evictUser: (): number => 0 };

interface MockReq {
  readonly headers?: Record<string, string>;
  readonly parseBody?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly url?: string;
}
interface MockCtx {
  /** Mirrors Hono's `c.header(name, value, { append })`. The third arg is NOT decoration: the mint and the
   *  logout both write MORE THAN ONE `Set-Cookie` (#2413 — the active cookie plus a clear of the other
   *  posture's name), and a mock that silently collapsed them to the last one would report a green mint while
   *  the real route shipped only a clearing cookie. */
  readonly header: (name: string, value: string, options?: { readonly append?: boolean }) => void;
  readonly json: (body: unknown, status?: number) => Response;
  readonly body: (data: string | Uint8Array | null, status?: number) => Response;
  readonly redirect: (location: string, status?: number) => Response;
  readonly req: {
    readonly parseBody: () => Promise<Record<string, string>>;
    readonly header: (name: string) => string | undefined;
    readonly query: (name: string) => string | undefined;
    readonly url: string;
    readonly raw: { readonly headers: Headers };
  };
}
type Handler = (c: MockCtx) => Promise<Response> | Response;

function makeCtx(req: MockReq): MockCtx {
  const out = new Headers();
  const merge = (status: number, body: string | Uint8Array | null, extra?: Record<string, string>): Response => {
    const headers = new Headers(out);
    for (const [k, v] of Object.entries(extra ?? {})) {
      headers.set(k, v);
    }
    // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
    return new Response(body instanceof Uint8Array ? new Uint8Array(body) : body, { status, headers });
  };
  return {
    header: (name: string, value: string, options?: { readonly append?: boolean }): void => {
      if (options?.append === true) {
        out.append(name, value);
        return;
      }
      out.set(name, value);
    },
    json: (body: unknown, status = 200): Response => merge(status, JSON.stringify(body), { "content-type": "application/json" }),
    body: (data: string | Uint8Array | null, status = 200): Response => merge(status, data),
    redirect: (location: string, status = 302): Response => merge(status, null, { location }),
    req: {
      parseBody: (): Promise<Record<string, string>> => Promise.resolve(req.parseBody ?? {}),
      header: (name: string): string | undefined => req.headers?.[name.toLowerCase()],
      query: (name: string): string | undefined => req.query?.[name],
      url: req.url ?? "http://localhost/",
      raw: { headers: new Headers(req.headers) },
    },
  };
}

// A never-touched Db stand-in: the mock harness only reaches route REGISTRATION (which builds the login
// limiter object but never calls it). The db-touching behavioral paths (throttle, mint) live in the int
// test over a real freshDb.
// The mock harness reaches only route REGISTRATION (builds the login limiter object but never calls it);
// the db-touching paths run over a real freshDb in the int test.
// @orb-waive no-test-fabrication(unknown): never-dereferenced registration-only stand-in. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const STUB_DB = {} as unknown as Db;

// The openid-client Configuration type, derived from the deps surface (the tests workspace doesn't depend on
// openid-client directly, so we borrow the type through OidcRoutesDeps rather than importing it).
type OidcConfig = Awaited<ReturnType<OidcRoutesDeps["getConfig"]>>;

/** A fake openid-client Configuration exposing only `serverMetadata()` — the one field the logout (A6) and
 *  back-channel (A5) routes read. openid-client's Configuration has no public test constructor, so this is the
 *  single sanctioned fabrication; every OidcRoutesDeps stub built below is otherwise fully typed. */
// openid-client Configuration has no test constructor; only serverMetadata() is exercised.
function fakeConfig(meta: { issuer: string; jwks_uri?: string; end_session_endpoint?: string }): OidcConfig {
  // @orb-waive no-test-fabrication(unknown): openid-client Configuration has no test constructor; only serverMetadata() is exercised. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { serverMetadata: () => meta } as unknown as OidcConfig;
}

/** #867 — the injected code→token exchange, as a test alias. A fake that RESOLVES stands in for a grant
 *  `openid-client` already verified (signature, issuer, audience, nonce, PKCE); one that REJECTS stands in
 *  for a replayed/expired code, a mismatch, or a transient IdP fault. */
type Exchange = OidcRoutesDeps["exchange"];

/** An exchange that must NEVER be reached on the path under test. It records the breach AND rejects, so a
 *  regression that let a request through to the IdP fails the call-count assertion instead of silently
 *  proceeding on a fake's happy path. */
function neverExchange(onCall: () => void): Exchange {
  return (): Promise<never> => {
    onCall();
    return Promise.reject(new Error("the token exchange must not run on this path"));
  };
}

/** A fully-typed `OidcRoutesDeps` stub (no double-cast) for the route tests that don't run the IdP round-trip.
 *  `getConfig` rejects by default; override it (with {@link fakeConfig}) for the logout / back-channel paths. */
function fakeOidcDeps(over: Partial<OidcRoutesDeps> = {}): OidcRoutesDeps {
  return {
    getConfig: () => Promise.reject(new Error("getConfig not stubbed")),
    exchange: neverExchange(() => undefined),
    redirectAllowlist: ["https://app.example/api/auth/oidc/callback"],
    scope: "openid profile email",
    claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
    groupsSeparator: ";",
    allowJitProvision: true,
    requireApproval: false,
    store: { mint: () => Promise.resolve(), consume: () => Promise.resolve(null) },
    ...over,
  };
}

function routesOf(deps: AuthRoutesDeps): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  const record =
    (method: string) =>
    (path: string, ...handlers: Handler[]): unknown => {
      // The login route registers as (path, bodyLimit-middleware, handler); capture the FINAL arg (the real
      // handler) so the pure registration assertions still resolve the route's terminal handler.
      const terminal = handlers.at(-1);
      if (terminal !== undefined) {
        routes.set(`${method} ${path}`, terminal);
      }
      return app;
    };
  const app = { get: record("GET"), post: record("POST") };
  // @orb-waive no-test-fabrication(unknown): minimal route-capture mock; the real framework app type is far larger than what route REGISTRATION exercises here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerAuthRoutes(app as unknown as Parameters<typeof registerAuthRoutes>[0], deps);
  return routes;
}

function handlerFor(deps: AuthRoutesDeps, key: string): Handler {
  const handler = routesOf(deps).get(key);
  if (handler === undefined) {
    throw new Error(`route not registered: ${key}`);
  }
  return handler;
}

function registeredHandlerCount(deps: AuthRoutesDeps, key: string): number {
  const counts = new Map<string, number>();
  const record =
    (method: string) =>
    (path: string, ...handlers: Handler[]): unknown => {
      counts.set(`${method} ${path}`, handlers.length);
      return app;
    };
  const app = { get: record("GET"), post: record("POST") };
  // @orb-waive no-test-fabrication(unknown): registration-only route capture; handler count proves the middleware belt is present. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerAuthRoutes(app as unknown as Parameters<typeof registerAuthRoutes>[0], deps);
  return counts.get(key) ?? 0;
}

interface SessionRecorder {
  readonly sessions: AuthSessionsPort;
  /** W7a — the live-socket eviction the routes fire beside every revoke. */
  readonly sockets: SessionSocketEviction;
  createdFor: UserId | null;
  createdUa: string | null | undefined;
  /** #141 — the raw OIDC id_token the callback handed `sessions.create` (undefined = never passed). */
  createdIdToken: string | null | undefined;
  revoked: string | null;
  /** #141 — the end-session hint the stubbed revoke hands back; overridden per-test for the OIDC arms. */
  revokedIdToken: string | null;
  /** WHICH session the logout evicted (per-SESSION, F4) and WHICH users a subject-wide revoke did. */
  evictedSessions: SessionId[];
  evictedUsers: UserId[];
}
function recordingSessions(): SessionRecorder {
  const rec: SessionRecorder = {
    createdFor: null,
    createdUa: undefined,
    createdIdToken: undefined,
    revoked: null,
    revokedIdToken: null,
    evictedSessions: [],
    evictedUsers: [],
    sockets: {
      evictSession: (sessionId): number => {
        rec.evictedSessions.push(sessionId);
        return 1;
      },
      evictUser: (userId): number => {
        rec.evictedUsers.push(userId);
        return 1;
      },
    },
    sessions: {
      create: (p): Promise<{ token: SessionToken; expiresAt: number }> => {
        rec.createdFor = p.userId;
        rec.createdUa = p.userAgent;
        rec.createdIdToken = p.oidcIdToken;
        return Promise.resolve({ token: castId<SessionToken>("tok-123"), expiresAt: NOW + THIRTY_DAYS_MS });
      },
      revokeByToken: (token: SessionToken): Promise<RevokedSessionStub | null> => {
        rec.revoked = token;
        return Promise.resolve({ sessionId: REVOKED_SESSION_ID, oidcIdToken: rec.revokedIdToken });
      },
      provisionIdentity: (
        _identity: ResolvedIdentity,
      ): Promise<{ outcome: "provisioned"; userId: UserId; enabled: boolean; role: UserRole; identityChanged: boolean } | { outcome: "denied" }> =>
        Promise.resolve({
          outcome: "provisioned",
          userId: castId<UserId>("usr_x"),
          enabled: true,
          role: "user",
          identityChanged: false,
        }),
      revokeByExternalId: (): Promise<RevokedSessionsSummary> => Promise.resolve({ revoked: 0, userIds: [] }),
    },
  };
  return rec;
}

describe("cookie I/O", () => {
  test("serializeSessionCookie carries the full __Host- policy + Max-Age", () => {
    const cookie = serializeSessionCookie(castId<SessionToken>("tok-123"), THIRTY_DAYS_MS / 1000);
    expect(cookie).toContain(`${COOKIE}=tok-123`);
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
  });

  // #2413 — LOGOUT CLEARS EVERY NAME THIS APP HAS EVER MINTED UNDER, not just the active one. An operator
  // who flips `SESSION_COOKIE_INSECURE` leaves the other name's cookie in every signed-in browser; only the
  // active name is ever READ, so it cannot authenticate — but "sign out" must still mean the browser stops
  // holding a session token, and a one-name clear silently left one behind.
  test("serializeClearedSessionCookies expires BOTH cookie names immediately", () => {
    const cookies = serializeClearedSessionCookies();
    expect(cookies).toHaveLength(2);
    expect(cookies.map((c) => c.split("=")[0])).toEqual([SESSION_COOKIE_NAME_SECURE, SESSION_COOKIE_NAME_INSECURE]);
    for (const cookie of cookies) {
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Path=/");
    }
  });

  // The attributes follow the NAME, not the posture — and they have to. A browser DISCARDS any `Set-Cookie`
  // under a `__Host-` name that omits `Secure` + `Path=/` (RFC 6265bis §4.1.3.2), so a clear written with the
  // insecure attribute string would silently fail to clear anything; conversely the bare name must NOT carry
  // `Secure`, or the whole point (a plain-http origin keeps it) is lost on the clear as well as the mint.
  test("each cleared name carries the attributes its own name requires", () => {
    const [secureClear, insecureClear] = serializeClearedSessionCookies();
    expect(secureClear).toContain("Secure");
    expect(insecureClear).not.toContain("Secure");
    expect(insecureClear).toContain("HttpOnly");
    expect(insecureClear).toContain("SameSite=Lax");
  });
});

const ownerAuth =
  (userId: UserId | null): LocalAuthenticator =>
  (): Promise<UserId | null> =>
    Promise.resolve(userId);

// The login HANDLER's behavioral paths (valid/bad/missing creds, the per-IP throttle, the body cap) run
// through the REAL Hono app + a freshDb in auth-routes.int.test.ts — the throttle needs a live limiter
// (db) and `clientIp` needs a real conninfo env, neither of which the mock ctx provides. Here we only
// assert the mode-conditional REGISTRATION (pure).
describe("local login — registration", () => {
  test("login route is NOT registered without an authenticator", () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    expect(routesOf(deps).has("POST /api/auth/login")).toBe(false);
  });

  test("login route IS registered with an authenticator", () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
      sockets: rec.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      authenticate: ownerAuth(castId<UserId>("usr_owner")),
    };
    expect(routesOf(deps).has("POST /api/auth/login")).toBe(true);
  });
});

// CSRF gate is enforced here (header read is pure); revoke/clear ride the mock ctx. The cross-site
// force-logout attack: a top-level POST with the session cookie (SameSite=Lax rides it) but NO custom
// header must NOT revoke.
describe("logout — CSRF gate", () => {
  const csrf = "x-orb-csrf";

  test("WITHOUT the CSRF header → 403, does NOT revoke (blocks cross-site force-logout)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123` } }));
    expect(res.status).toBe(403);
    expect(rec.revoked).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  // A6 — logout now returns 200 `{endSessionUrl}` (null in non-oidc modes) instead of 204, so the client can
  // continue to the IdP end-session endpoint after the local revoke. The CSRF gate + revoke + clear are unchanged.
  test("WITH the CSRF header + a session cookie → revokes the token + clears the cookie (200, endSessionUrl null)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1" } }));
    expect(res.status).toBe(200);
    expect(rec.revoked).toBe("tok-123");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(((await res.json()) as { endSessionUrl: string | null }).endSessionUrl).toBeNull(); // no oidc deps here
  });

  // #2413 — the ROUTE, not just the serializer: logout must write a SEPARATE `Set-Cookie` per name. The
  // failure this catches is a plain `c.header("Set-Cookie", …)` per value, which REPLACES rather than
  // appends: the response would carry one clearing cookie, the other name's token would survive the sign-out,
  // and every existing assertion (`toContain("Max-Age=0")`) would still be green.
  test("logout writes ONE Set-Cookie PER cookie name (append, never replace)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1" } }));
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.map((c) => c.split("=")[0])).toEqual([SESSION_COOKIE_NAME_SECURE, SESSION_COOKIE_NAME_INSECURE]);
    for (const cookie of cookies) {
      expect(cookie).toContain("Max-Age=0");
    }
  });

  // W7a — the revoke ends the COOKIE; this ends the STREAM the cookie already opened. Before it, a socket
  // froze its Principal at connect and kept delivering to a signed-out tab until the connection died on its
  // own. PER SESSION (owner fork F4): signing out on the phone must not close the desktop's stream, so the
  // route evicts by the session id `revokeByToken` reports — never by the user.
  test("W7a logout EVICTS the live sockets of the session it just ended — and only that session", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };

    await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1" } }));

    expect(rec.evictedSessions).toEqual([REVOKED_SESSION_ID]);
    // Never the user-wide sweep: that arm belongs to admin revoke / disable, where killing every device is
    // the point (see entry/compose/admin.ts).
    expect(rec.evictedUsers).toEqual([]);
  });

  test("W7a an ALREADY-revoked cookie evicts nothing (the route ends no session, so it closes no socket)", async () => {
    const rec = recordingSessions();
    const sessions: AuthSessionsPort = { ...rec.sessions, revokeByToken: (): Promise<RevokedSessionStub | null> => Promise.resolve(null) };
    const deps: AuthRoutesDeps = { sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };

    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1" } }));

    expect(res.status).toBe(200); // still clears the cookie — logout is idempotent for the caller
    expect(rec.evictedSessions).toEqual([]);
  });

  test("W7a a CSRF-refused logout evicts nothing (the 403 short-circuits before the revoke)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };

    await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123` } }));

    // A cross-site force-logout must not be able to kill a victim's live stream either.
    expect(rec.evictedSessions).toEqual([]);
  });

  test("WITH the CSRF header but no cookie → still clears, does not revoke (200)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, sockets: rec.sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { [csrf]: "1" } }));
    expect(res.status).toBe(200);
    expect(rec.revoked).toBeNull();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  // A6 — with oidc deps whose issuer exposes an end_session_endpoint, logout returns it so the client can end
  // the upstream SSO session.
  test("with oidc deps → logout returns the IdP end_session_endpoint", async () => {
    const rec = recordingSessions();
    const endSession = "https://idp.example/application/o/orb/end-session/";
    const oidc = fakeOidcDeps({
      getConfig: () => Promise.resolve(fakeConfig({ issuer: "https://idp.example", end_session_endpoint: endSession })),
    });
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
      sockets: rec.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc,
    };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1" } }));
    expect(res.status).toBe(200);
    // No forwarded-host on this ctx ⇒ the origin is unresolvable ⇒ no post_logout param, just the bare endpoint.
    expect(((await res.json()) as { endSessionUrl: string | null }).endSessionUrl).toBe(endSession);
  });

  // ══ #141 — THE END-SESSION URL'S THREE SHAPES (owner ruling 2026-08-30) ═══════════════════════════
  //
  // THE INVARIANT UNDER TEST IS AN IMPLICATION, NOT A LITERAL: `post_logout_redirect_uri` is present ONLY
  // IF `id_token_hint` is. The earlier pins here asserted the URL was BARE, which was the correct shape
  // only while the deployment persisted no id_token; the owner ruled that it now does, so the RULING
  // survives and its INPUT changed. What must never regress is the pairing — #141's first attempt
  // (8446a55ce, reverted) sent the redirect param ALONE, and authentik 2026.5.5's `EndSessionView.validate`
  // raises `invalid_request`/`id_token_hint_missing` BEFORE the flow planner, so the invalidation flow
  // never runs and THE UPSTREAM SSO SESSION SURVIVES the sign-out (regression #437). A redirect param
  // without a hint is strictly worse than sending nothing.
  //
  // Three shapes, one pin each, plus the pairing pin that is the actual security fence.
  const endSessionDeps = (rec: SessionRecorder, endSession: string): AuthRoutesDeps => ({
    sessions: rec.sessions,
    sockets: rec.sockets,
    now: (): number => NOW,
    db: STUB_DB,
    resolveLoginLimit: (): number => 10,
    oidc: fakeOidcDeps({
      getConfig: () => Promise.resolve(fakeConfig({ issuer: "https://idp.example", end_session_endpoint: endSession })),
    }),
  });
  /** fakeOidcDeps.redirectAllowlist = ["https://app.example/api/auth/oidc/callback"], so this origin resolves. */
  const allowlistedOrigin = { "x-forwarded-proto": "https", "x-forwarded-host": "app.example" };

  async function logoutEndSessionUrl(deps: AuthRoutesDeps, origin: Record<string, string> = {}): Promise<string | null> {
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1", ...origin } }));
    expect(res.status).toBe(200);
    return ((await res.json()) as { endSessionUrl: string | null }).endSessionUrl;
  }

  test("#141 the token-bearing logout response is no-store", async () => {
    const rec = recordingSessions();
    rec.revokedIdToken = ID_TOKEN;
    const deps = endSessionDeps(rec, "https://idp.example/application/o/orb/end-session/");
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [csrf]: "1", ...allowlistedOrigin } }));
    // The body now carries the id_token inside the end-session URL, so it must never be cached anywhere.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("#141 HINT + REDIRECT — an OIDC session on an ALLOWLISTED origin round-trips back to our own /login", async () => {
    const rec = recordingSessions();
    rec.revokedIdToken = ID_TOKEN; // this session was minted by the OIDC callback and carried an id_token
    const endSession = "https://idp.example/application/o/orb/end-session/";
    const url = new URL((await logoutEndSessionUrl(endSessionDeps(rec, endSession), allowlistedOrigin)) ?? "");

    expect(url.origin + url.pathname).toBe(endSession);
    // The hint is the row's id_token VERBATIM — a mangled hint is one authentik rejects.
    expect(url.searchParams.get("id_token_hint")).toBe(ID_TOKEN);
    // The return target is derived from the ALLOWLISTED callback URL's origin, never from the raw header,
    // and it is our login surface — this is the papercut #141 was filed against.
    //
    // BYTE-EXACT, and that is a protocol requirement, not tidiness: authentik matches
    // `post_logout_redirect_uri` STRICTLY against the URL registered on the provider
    // (`redirect_uri_type: logout`), so a trailing slash or a stray query makes the OP reject the request.
    // `new URL("/login", <allowlisted callback>)` is what guarantees the shape; these two assertions are
    // what would catch a future "helpful" normalisation adding either.
    const returnTo = url.searchParams.get("post_logout_redirect_uri") ?? "";
    expect(returnTo).toBe("https://app.example/login");
    expect(returnTo.endsWith("/")).toBe(false);
    expect(new URL(returnTo).search).toBe("");
    // No third param crept in.
    expect([...url.searchParams.keys()].sort()).toEqual(["id_token_hint", "post_logout_redirect_uri"]);
  });

  test("#141 HINT ONLY — an unresolvable origin drops the redirect param and keeps the hint", async () => {
    const rec = recordingSessions();
    rec.revokedIdToken = ID_TOKEN;
    const endSession = "https://idp.example/application/o/orb/end-session/";
    // No forwarded-host on this ctx ⇒ deriveRedirectUri resolves nothing ⇒ no return target to send.
    const url = new URL((await logoutEndSessionUrl(endSessionDeps(rec, endSession))) ?? "");

    expect(url.searchParams.get("id_token_hint")).toBe(ID_TOKEN);
    expect(url.searchParams.has("post_logout_redirect_uri")).toBe(false);
  });

  test("#141 THE PAIRING FENCE — an OFF-ALLOWLIST forwarded-host is never reflected as the return target", async () => {
    const rec = recordingSessions();
    rec.revokedIdToken = ID_TOKEN;
    const endSession = "https://idp.example/application/o/orb/end-session/";
    // `evil.example` is not in OIDC_REDIRECT_URIS. Handing it to the IdP as post_logout_redirect_uri would
    // be an open redirect laundered through the OP, so the param must be absent — the hint still rides.
    const url = new URL(
      (await logoutEndSessionUrl(endSessionDeps(rec, endSession), { "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" })) ?? "",
    );

    expect(url.searchParams.has("post_logout_redirect_uri")).toBe(false);
    expect(url.href).not.toContain("evil.example");
    expect(url.searchParams.get("id_token_hint")).toBe(ID_TOKEN);
  });

  test("#141 BARE — NO stored id_token means NO redirect param either, even on an allowlisted origin (#437)", async () => {
    const rec = recordingSessions();
    rec.revokedIdToken = null; // a local login, a pre-#141 row, or a rotated SESSION_SECRET
    const endSession = "https://idp.example/application/o/orb/end-session/";
    const endSessionUrl = await logoutEndSessionUrl(endSessionDeps(rec, endSession), allowlistedOrigin);

    // Byte-identical to the discovery value. THIS is the fence: the origin WOULD have resolved, so a
    // hint-less build that still appended the redirect param is exactly the 400 that left the SSO session
    // alive. No param may be smuggled under another name either, hence the empty-search assertion.
    expect(endSessionUrl).toBe(endSession);
    expect(new URL(endSessionUrl ?? "").search).toBe("");
  });

  test("#141 an already-revoked cookie yields NO hint — the winning revoke consumed it", async () => {
    const rec = recordingSessions();
    const endSession = "https://idp.example/application/o/orb/end-session/";
    const deps = endSessionDeps(rec, endSession);
    const sessions: AuthSessionsPort = { ...rec.sessions, revokeByToken: (): Promise<RevokedSessionStub | null> => Promise.resolve(null) };
    const endSessionUrl = await logoutEndSessionUrl({ ...deps, sessions }, allowlistedOrigin);

    // A second logout on a dead cookie cannot resurrect the hint (the row's blob was cleared), so it gets
    // the bare URL — and never the unpaired redirect param.
    expect(endSessionUrl).toBe(endSession);
    expect(new URL(endSessionUrl ?? "").search).toBe("");
  });
});

describe("OIDC claim mapping (provider-agnostic — B2)", () => {
  const authentikClaims: OidcClaimMap = {
    usernameClaim: "preferred_username",
    uidClaim: "sub",
    groupsClaim: "groups",
    emailClaim: "email",
  };

  test("default (authentik) claims map preferred_username / sub / groups / email", () => {
    const identity = identityFromClaims(
      {
        preferred_username: "alice",
        sub: "sub-alice",
        groups: ["staff", "admins"],
        email: "alice@example.com",
      },
      authentikClaims,
    );
    expect(identity).toEqual({
      externalId: "sub-alice",
      handle: "alice",
      groups: ["staff", "admins"],
      email: "alice@example.com",
    });
  });

  test("a non-default claim map (Azure AD upn/oid/roles) maps identity correctly", () => {
    // The authentik defaults would find NOTHING in these Azure-shaped claims — the configurable names are
    // what make it work. The `roles` claim is what OWNER_GROUP later maps to owner.
    const azureClaims = {
      upn: "bob@contoso.com",
      oid: "00000000-1111-2222-3333-444444444444",
      roles: ["orb-owners", "eng"],
      // decoy authentik-shaped keys that MUST be ignored under the Azure map:
      preferred_username: "should-be-ignored",
      sub: "should-be-ignored",
    };
    const identity = identityFromClaims(azureClaims, {
      usernameClaim: "upn",
      uidClaim: "oid",
      groupsClaim: "roles",
      emailClaim: "email",
    });
    expect(identity).toEqual({
      externalId: "00000000-1111-2222-3333-444444444444",
      handle: "bob@contoso.com",
      groups: ["orb-owners", "eng"],
      email: null,
    });
  });

  test("missing username claim → null (fail-closed point #4)", () => {
    expect(identityFromClaims({ sub: "sub-x", groups: [] }, authentikClaims)).toBeNull();
    expect(identityFromClaims(undefined, authentikClaims)).toBeNull();
  });

  test("no uid claim → externalId null (handle keys the row); no email → email null", () => {
    const identity = identityFromClaims({ preferred_username: "carol" }, authentikClaims);
    expect(identity).toEqual({ externalId: null, handle: "carol", groups: [], email: null });
  });

  // #34 — THE OPERATOR SIGNAL FOR A SILENTLY-DISABLED SECURITY CONTROL. `externalId` is the identity key,
  // and the bind-once takeover refusal (`isSubjectMismatch`, domain/sessions/verbs/provision-identity.ts) is
  // deliberately scoped to SUBJECT-BEARING logins — with a null subject there is nothing to contradict, so
  // the guard cannot fire and a handle match walks straight onto whatever row holds that handle. In `oidc`
  // mode a null subject is a MISCONFIGURATION, never a posture (OIDC Core REQUIRES `sub` in an ID token), so
  // it means OIDC_UID_CLAIM names a claim this IdP does not emit. The `identityFromClaims` MAPPER stays
  // observability-only (identity byte-identical either way, the warn is the tell) — but since #699 the box no
  // longer runs guard-less: `oidcSessionIdentity` REFUSES a null-subject identity at the callback (pinned
  // below). This is the oidc-only seam (forward-header resolves in infra/auth/modes/forward-header.ts, where
  // null IS the normal shape and stays legitimate), so the warn AND the refusal are mode-scoped by construction.
  test("a uid claim the IdP omits WARNS (oidc runs with the bind-once guard inert) — identity unchanged", () => {
    const spy = vi.spyOn(logger, "warn");
    const identity = identityFromClaims({ preferred_username: "carol" }, authentikClaims);
    expect(identity).toEqual({ externalId: null, handle: "carol", groups: [], email: null }); // NO behavior change
    expect(spy).toHaveBeenCalledOnce();
    const [bindings] = spy.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings["security"]).toBe(true);
    expect(bindings["event"]).toBe("oidc_subject_claim_missing");
    expect(bindings["uidClaim"]).toBe("sub"); // names the MISCONFIGURED knob, not just the symptom
    expect(bindings["handle"]).toBe("carol");
  });

  test("a subject-bearing login is SILENT (the warn is not a per-login siren)", () => {
    const spy = vi.spyOn(logger, "warn");
    identityFromClaims({ preferred_username: "alice", sub: "sub-alice" }, authentikClaims);
    expect(spy).not.toHaveBeenCalled();
  });

  // #699 — THE FAIL-CLOSED REFUSAL, at the seam the OIDC callback actually calls. No red-first proof is
  // possible for the ROUTE (the null-subject state is unreachable by default — `oauth4webapi` validatePresence
  // refuses an ID token without `sub`, so the token exchange never yields a subject-less claims object on a
  // correctly-configured box — and the exchange is a module-level `openid-client` import, not an injected dep,
  // so it can't be driven without a real IdP; see the R7 note below). So the guard is pinned at its pure,
  // exported seam instead: `oidcSessionIdentity`, which is exactly what the callback branches on. A null
  // externalId ⇒ null ⇒ the callback redirects to ?authError=no_identity and mints no session. `identityFromClaims`
  // itself is UNCHANGED (still returns the subject-less identity + fires the tell); the refusal lives one tier up.
  test("oidcSessionIdentity REFUSES a null-subject identity (the #699 fail-closed gate)", () => {
    // A well-formed username but the uid claim absent — the exact misconfigured-OIDC_UID_CLAIM shape.
    expect(oidcSessionIdentity({ preferred_username: "carol" }, authentikClaims)).toBeNull();
    // …and the mapper it wraps still HANDS BACK that identity (the refusal is the callback's, not the mapper's).
    expect(identityFromClaims({ preferred_username: "carol" }, authentikClaims)).toEqual({
      externalId: null,
      handle: "carol",
      groups: [],
      email: null,
    });
  });

  test("oidcSessionIdentity ADMITS a subject-bearing identity unchanged (the fix refuses nothing legitimate)", () => {
    const identity = oidcSessionIdentity({ preferred_username: "alice", sub: "sub-alice", email: "alice@corp.example" }, authentikClaims);
    expect(identity).toEqual({ externalId: "sub-alice", handle: "alice", groups: [], email: "alice@corp.example" });
  });

  test("oidcSessionIdentity refuses a no-username login too (folds the pre-existing null-identity arm)", () => {
    expect(oidcSessionIdentity({ sub: "sub-only", groups: [] }, authentikClaims)).toBeNull();
    expect(oidcSessionIdentity(undefined, authentikClaims)).toBeNull();
  });

  // The username claim missing already fails closed (null identity, no session) — there is no login to warn
  // about, and firing here would drown the real signal in noise from probes/misdirected requests.
  test("a MISSING username claim stays silent — it already fails closed, it is not a guard-disabled login", () => {
    const spy = vi.spyOn(logger, "warn");
    expect(identityFromClaims({ groups: [] }, authentikClaims)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  test("NESTED dot-path claims (Entra/AD FS) resolve — groups at `user.memberOf`, email nested", () => {
    const identity = identityFromClaims(
      {
        preferred_username: "dave",
        user: { memberOf: ["Orb Admins", "Orb Users"] },
        contact: { mail: "dave@corp.example" },
        sub: "sub-dave",
      },
      {
        usernameClaim: "preferred_username",
        uidClaim: "sub",
        groupsClaim: "user.memberOf",
        emailClaim: "contact.mail",
      },
    );
    expect(identity).toEqual({
      externalId: "sub-dave",
      handle: "dave",
      groups: ["Orb Admins", "Orb Users"],
      email: "dave@corp.example",
    });
  });

  test("a dot-path that hits a non-object mid-walk → absent (groups [], not a crash)", () => {
    const identity = identityFromClaims(
      { preferred_username: "erin", groups: "not-an-object" },
      {
        usernameClaim: "preferred_username",
        uidClaim: "sub",
        groupsClaim: "groups.nested",
        emailClaim: "email",
      },
    );
    expect(identity?.groups).toEqual([]);
  });
});

// A4 — tolerant groups-claim VALUE parsing. An authentik property mapping may emit `groups` as a single
// separator-joined STRING rather than a JSON array; before this it yielded [], which under
// OIDC_ALLOWED_GROUPS denied EVERY login (a fail-closed misconfiguration that reads like a broken IdP). The
// separator is injected (OIDC_GROUPS_SEPARATOR, default ';').
describe("OIDC groups-claim parsing (A4 — array | joined-string | single-string | empty)", () => {
  const claims: OidcClaimMap = { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" };
  const groupsFor = (groups: unknown, separator?: string): readonly string[] | undefined =>
    identityFromClaims({ preferred_username: "u", sub: "s", groups }, claims, separator)?.groups;

  test("an ARRAY yields its string members", () => {
    expect(groupsFor(["a", "b"])).toEqual(["a", "b"]);
  });

  test("a ';'-JOINED string splits into a group array (the authentik property-mapping shape)", () => {
    expect(groupsFor("staff;admins;eng")).toEqual(["staff", "admins", "eng"]);
  });

  test("a joined string is TRIMMED and empties dropped (no phantom '' group)", () => {
    expect(groupsFor(" staff ; ; admins ")).toEqual(["staff", "admins"]);
  });

  test("a SINGLE string with no separator is one group", () => {
    expect(groupsFor("just-one")).toEqual(["just-one"]);
  });

  test("an empty string ⇒ [] (not a [''] that would slip a blank-named group past a gate)", () => {
    expect(groupsFor("")).toEqual([]);
  });

  test("a CUSTOM separator (comma) splits on it", () => {
    expect(groupsFor("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });

  test("a non-string / non-array value ⇒ [] (a number, an object)", () => {
    expect(groupsFor(42)).toEqual([]);
    expect(groupsFor({ nope: true })).toEqual([]);
  });

  test("an array with non-string members keeps only the strings", () => {
    expect(groupsFor(["a", 1, null, "b"])).toEqual(["a", "b"]);
  });

  // #1478 item 4 — ONE normalisation for both claim shapes. The CONFIG side is trimmed everywhere
  // (`csv()` for OIDC_ADMIN_GROUPS / OIDC_ALLOWED_GROUPS / OWNER_HANDLES, and OWNER_GROUP since the same
  // issue), so a padded member in an ARRAY-shaped claim matched no configured name — an unexpected DENY
  // under OIDC_ALLOWED_GROUPS, or a missing elevation under the admin/owner lists.
  test("an ARRAY member is TRIMMED and empties dropped — the same normalisation as the joined-string branch", () => {
    expect(groupsFor([" admins ", "staff\t", "", "   "])).toEqual(["admins", "staff"]);
  });

  test("…and trimming never WIDENS the match — a near-miss member stays a different group", () => {
    // Config-side names are compared exactly (`intersects`/`includes`), so " admins " must land on
    // `admins` and "admin" must NOT.
    expect(groupsFor(["admin"])).toEqual(["admin"]);
    expect(groupsFor([" Neo Owners "])).toEqual(["Neo Owners"]);
  });
});

// #140 — THE GROUPS-CLAIM ARRIVAL RECEIPT. Until this line existed the provisioning path logged handle +
// externalId and never the claim that decides the ROLE, so "does authentik's `groups` actually ride the
// token?" was unobservable on the box (the 2026-08-09 authentik crosscheck's open residual #2). It has to
// live in the MAPPER: `ResolvedIdentity.groups` is a `string[]`, so by the time `provisionIdentity` sees it
// "the IdP emitted nothing" and "the IdP emitted an empty list" are the same value — and only the first is a
// misconfiguration. Observability only: every assertion below also pins that the identity is unchanged.
describe("OIDC groups-claim ARRIVAL observability (#140)", () => {
  const claims: OidcClaimMap = { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" };

  /** The bindings of the one `oidc_groups_claim` info line this mapper call emitted. */
  function arrivalLine(raw: Record<string, unknown>, claimMap: OidcClaimMap = claims): Record<string, unknown> {
    const spy = vi.spyOn(logger, "info");
    identityFromClaims(raw, claimMap);
    const call = spy.mock.calls.find(([bindings]) => (bindings as Record<string, unknown>)["event"] === "oidc_groups_claim");
    if (call === undefined) {
      throw new Error("no oidc_groups_claim line was emitted");
    }
    return call[0] as Record<string, unknown>;
  }

  test("a PRESENT groups claim logs the group NAMES + the configured claim name (the arrival receipt)", () => {
    const line = arrivalLine({ preferred_username: "alice", sub: "sub-alice", groups: ["Orb Admins", "eng"] });
    expect(line["groupsClaimPresent"]).toBe(true);
    expect(line["groupsClaim"]).toBe("groups"); // names the KNOB (OIDC_GROUPS_CLAIM), not just the symptom
    expect(line["groupsClaimShape"]).toBe("array");
    expect(line["groups"]).toEqual(["Orb Admins", "eng"]);
    expect(line["groupCount"]).toBe(2);
    expect(line["handle"]).toBe("alice");
  });

  test("an ABSENT groups claim is logged AS ABSENT — the fact the crosscheck could not observe", () => {
    const line = arrivalLine({ preferred_username: "alice", sub: "sub-alice" });
    expect(line["groupsClaimPresent"]).toBe(false);
    expect(line["groupsClaimShape"]).toBe("undefined");
    expect(line["groups"]).toEqual([]);
    expect(line["groupCount"]).toBe(0);
  });

  // The distinction the whole line exists for: both of these reach `provisionIdentity` as `groups: []`.
  test("an EMPTY-array claim is PRESENT, not absent (distinguishable only here)", () => {
    const line = arrivalLine({ preferred_username: "alice", sub: "sub-alice", groups: [] });
    expect(line["groupsClaimPresent"]).toBe(true);
    expect(line["groupsClaimShape"]).toBe("array");
    expect(line["groups"]).toEqual([]);
  });

  test("the arrival line follows the CONFIGURED claim name, not a hardcoded `groups`", () => {
    const line = arrivalLine(
      { preferred_username: "dave", sub: "sub-dave", user: { memberOf: ["Orb Admins"] }, groups: ["decoy-must-be-ignored"] },
      { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "user.memberOf", emailClaim: "email" },
    );
    expect(line["groupsClaim"]).toBe("user.memberOf");
    expect(line["groups"]).toEqual(["Orb Admins"]);
  });

  // BOUNDING. The claim is external, unvalidated text on the UNAUTHENTICATED login path: one login must not
  // be able to flood the log ring. The true size still rides as `groupCount`, so `groups.length < groupCount`
  // is the tell that the list was capped.
  test("an absurd group list is BOUNDED in the log line while groupCount stays truthful", () => {
    const many = Array.from({ length: 500 }, (_, i) => `g${i}`);
    const line = arrivalLine({ preferred_username: "alice", sub: "sub-alice", groups: many });
    expect(line["groupCount"]).toBe(500);
    expect(line["groups"]).toHaveLength(32);
  });

  test("an absurdly LONG group name is truncated in the log line", () => {
    const line = arrivalLine({ preferred_username: "alice", sub: "sub-alice", groups: ["x".repeat(4096)] });
    expect((line["groups"] as string[])[0]).toHaveLength(64);
  });
});

// #140 — THE SILENTLY-DISABLED-CONTROL SIGNAL (the same class as #34's `oidc_subject_claim_missing`). With
// group governance ACTIVE, a login that carries no usable groups claim is not a quiet edge case: under
// OIDC_ADMIN_GROUPS nobody is ever granted admin AND an existing group-derived admin is demoted by the
// login re-derive; under OIDC_ALLOWED_GROUPS the fail-closed gate denies EVERY login. Both read as "the IdP
// is broken" with nothing naming the cause. Gated on governance so a box that never configured groups is
// silent — the false-positive controls below are as load-bearing as the positive ones.
describe("OIDC groups-claim missing → securityEvent when group governance is ACTIVE (#140)", () => {
  const claims: OidcClaimMap = { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" };

  /** The bindings of the `oidc_groups_claim_missing` warn, or undefined when it did not fire. */
  function missingWarn(raw: Record<string, unknown>): Record<string, unknown> | undefined {
    const spy = vi.spyOn(logger, "warn");
    identityFromClaims(raw, claims);
    const call = spy.mock.calls.find(([bindings]) => (bindings as Record<string, unknown>)["event"] === "oidc_groups_claim_missing");
    return call?.[0] as Record<string, unknown> | undefined;
  }

  test("ABSENT claim + OIDC_ADMIN_GROUPS set ⇒ securityEvent naming the misconfigured knob", () => {
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const warn = missingWarn({ preferred_username: "alice", sub: "sub-alice" });
    expect(warn?.["security"]).toBe(true);
    expect(warn?.["groupsClaim"]).toBe("groups");
    expect(warn?.["handle"]).toBe("alice");
    expect(warn?.["groupsClaimShape"]).toBe("undefined");
  });

  test("ABSENT claim + OIDC_ALLOWED_GROUPS set ⇒ fires too (that gate denies EVERY login without groups)", () => {
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "Orb Users");
    expect(missingWarn({ preferred_username: "alice", sub: "sub-alice" })).toBeDefined();
  });

  // A property mapping emitting the wrong TYPE is the same silently-disabled control as emitting nothing —
  // `normalizeGroups` yields [] for both, so the gate/derivation sees no groups either way.
  test("a claim of the WRONG TYPE + governance active ⇒ fires, and names the shape it got", () => {
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    const warn = missingWarn({ preferred_username: "alice", sub: "sub-alice", groups: 42 });
    expect(warn?.["groupsClaimShape"]).toBe("number");
  });

  // THE FALSE-POSITIVE CONTROLS. A user genuinely in zero groups is not a misconfiguration, and a box that
  // never configured group governance has nothing to report — either firing here makes the signal a
  // per-login siren nobody reads.
  test("an EMPTY-array claim + governance active is SILENT (a user in no groups is legitimate)", () => {
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    expect(missingWarn({ preferred_username: "alice", sub: "sub-alice", groups: [] })).toBeUndefined();
  });

  test("an ABSENT claim with governance INACTIVE is SILENT (no groups configured ⇒ nothing is disabled)", () => {
    vi.stubEnv("OIDC_ADMIN_GROUPS", undefined);
    vi.stubEnv("OIDC_ALLOWED_GROUPS", undefined);
    expect(missingWarn({ preferred_username: "alice", sub: "sub-alice" })).toBeUndefined();
  });

  test("OBSERVABILITY ONLY — the identity is byte-identical with the signal firing", () => {
    vi.stubEnv("OIDC_ADMIN_GROUPS", "Orb Admins");
    expect(identityFromClaims({ preferred_username: "alice", sub: "sub-alice" }, claims)).toEqual({
      externalId: "sub-alice",
      handle: "alice",
      groups: [],
      email: null,
    });
  });
});

describe("OIDC route registration", () => {
  test("OIDC routes present only when oidc deps are supplied", () => {
    const rec = recordingSessions();
    const withoutOidc: AuthRoutesDeps = {
      sessions: rec.sessions,
      sockets: rec.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
    };
    expect(routesOf(withoutOidc).has("GET /api/auth/oidc/login")).toBe(false);

    const withOidc: AuthRoutesDeps = {
      sessions: rec.sessions,
      sockets: rec.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: fakeOidcDeps(),
    };
    const routes = routesOf(withOidc);
    expect(routes.has("GET /api/auth/oidc/login")).toBe(true);
    expect(routes.has("GET /api/auth/oidc/callback")).toBe(true);
  });
});

describe("deriveRedirectUri — origin-flexible, allowlist-gated (open-redirect guard)", () => {
  const fqdn = "https://chat.example.com/api/auth/oidc/callback";
  const lan = "https://192.168.1.10/api/auth/oidc/callback";
  const local = "https://localhost:8788/api/auth/oidc/callback";
  const allow = [fqdn, lan, local];
  const h = (init: Record<string, string>): Headers => new Headers(init);

  test("public FQDN via X-Forwarded-Proto/Host → the allowlisted callback", () => {
    const derived = deriveRedirectUri(h({ "x-forwarded-proto": "https", "x-forwarded-host": "chat.example.com" }), allow);
    expect(derived).toBe(fqdn);
  });

  test("a LAN-IP origin (raw Host, no proxy headers) derives + matches", () => {
    expect(deriveRedirectUri(h({ host: "192.168.1.10" }), allow)).toBe(lan);
  });

  test("a localhost origin derives + matches", () => {
    expect(deriveRedirectUri(h({ host: "localhost:8788" }), allow)).toBe(local);
  });

  test("proto is NEVER downgraded to http on an unknown origin (CVE-2024-52289 posture)", () => {
    // No X-Forwarded-Proto ⇒ defaults https; an http-only allowlist entry can't match the https candidate.
    const httpOnly = ["http://192.168.1.10/api/auth/oidc/callback"];
    expect(deriveRedirectUri(h({ host: "192.168.1.10" }), httpOnly)).toBeNull();
  });

  test("an off-allowlist origin → null (never reflected)", () => {
    expect(deriveRedirectUri(h({ "x-forwarded-host": "evil.example" }), allow)).toBeNull();
  });

  test("X-Forwarded-Host wins over Host for the derivation, but the allowlist still gates", () => {
    // A proxy legitimately rewrites XFH to the public host; the allowlist is the real gate.
    const derived = deriveRedirectUri(
      h({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "chat.example.com",
        host: "10.0.0.5:8788",
      }),
      allow,
    );
    expect(derived).toBe(fqdn);
  });

  test("no Host header at all → null (fails closed)", () => {
    expect(deriveRedirectUri(h({}), allow)).toBeNull();
  });
});

describe("OIDC login — the redirect_uri allowlist gate", () => {
  interface MintRecorder {
    readonly deps: OidcRoutesDeps;
    mints: number;
  }
  function recordingOidc(allowlist: readonly string[]): MintRecorder {
    const rec: MintRecorder = {
      mints: 0,
      deps: {
        // Must NOT run on an off-allowlist login (the 400 short-circuits before any IdP round-trip).
        getConfig: (): Promise<never> => Promise.reject(new Error("getConfig must not run on an off-allowlist login")),
        // The authorize leg never exchanges anything; an off-allowlist login must not reach the IdP at all.
        exchange: neverExchange(() => undefined),
        redirectAllowlist: allowlist,
        scope: "openid profile email",
        claims: {
          usernameClaim: "preferred_username",
          uidClaim: "sub",
          groupsClaim: "groups",
          emailClaim: "email",
        },
        groupsSeparator: ";",
        allowJitProvision: true,
        requireApproval: false,
        store: {
          mint: (): Promise<void> => {
            rec.mints += 1;
            return Promise.resolve();
          },
          consume: (): Promise<null> => Promise.resolve(null),
        },
      },
    };
    return rec;
  }

  test("an off-allowlist origin → 400, NO transaction minted, no discovery round-trip", async () => {
    const rec = recordingOidc(["https://chat.example.com/api/auth/oidc/callback"]);
    const deps: AuthRoutesDeps = {
      sessions: recordingSessions().sessions,
      sockets: INERT_EVICTION,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: rec.deps,
    };
    const res = await handlerFor(deps, "GET /api/auth/oidc/login")(makeCtx({ headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } }));
    expect(res.status).toBe(400);
    expect(rec.mints).toBe(0);
  });
});

// R7 — OIDC CALLBACK state/replay gate. The callback consumes the single-use PKCE transaction by the
// returned `state` BEFORE any token work; a null consume (forged / replayed / TTL-expired state) redirects
// and NEVER reaches the IdP token exchange.
//
// Since #867 the exchange is an INJECTED dep (`OidcRoutesDeps.exchange`), so "never reaches it" is asserted
// directly — a `neverExchange` counter — instead of by proxy through `getConfig`. The rest of the callback
// (the exchange itself and everything downstream: the #699 subject gate, the provisioning arms, the #141
// id_token hop) is proven in the "injected code→token exchange" describe below. What stays delegated to
// `openid-client` and is NOT re-asserted anywhere: the CRYPTOGRAPHY of the grant — JWKS signature, issuer
// and audience validation, nonce/PKCE binding. That is the audited primitive's job; this seam proves we
// present it the right inputs and fail closed on everything it rejects.
describe("OIDC callback — single-use state consume (replay/forgery/TTL gate)", () => {
  const callbackBase = "https://app.example/api/auth/oidc/callback";
  // Build a callback URL with a query so no long literal trips the noSecrets entropy heuristic.
  const callbackUrl = (query: Record<string, string>): string => {
    const u = new URL(callbackBase);
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, v);
    }
    return u.href;
  };

  function callbackDeps(consume: (state: string) => Promise<OidcTransaction | null>): {
    deps: AuthRoutesDeps;
    getConfigCalls: () => number;
    exchangeCalls: () => number;
    session: SessionRecorder;
    consumedWith: () => string | null;
  } {
    let getConfigCalls = 0;
    let exchangeCalls = 0;
    let consumedWith: string | null = null;
    const session = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: session.sessions,
      sockets: session.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: {
        // Must NOT run when the state consume fails — the redirect short-circuits before the token exchange.
        getConfig: (): Promise<never> => {
          getConfigCalls += 1;
          return Promise.reject(new Error("getConfig must not run on a failed state consume"));
        },
        // #867 — the direct assertion the pre-injection version could only make by proxy: a forged state
        // must not put a request on the wire to the IdP's token endpoint at all.
        exchange: neverExchange(() => {
          exchangeCalls += 1;
        }),
        redirectAllowlist: [callbackBase],
        scope: "openid profile email",
        claims: {
          usernameClaim: "preferred_username",
          uidClaim: "sub",
          groupsClaim: "groups",
          emailClaim: "email",
        },
        groupsSeparator: ";",
        allowJitProvision: true,
        requireApproval: false,
        store: {
          mint: (): Promise<void> => Promise.resolve(),
          consume: (s: string): Promise<OidcTransaction | null> => {
            consumedWith = s;
            return consume(s);
          },
        },
      },
    };
    return {
      deps,
      getConfigCalls: () => getConfigCalls,
      exchangeCalls: () => exchangeCalls,
      session,
      consumedWith: () => consumedWith,
    };
  }

  // A7 — a callback is a TOP-LEVEL browser navigation, so a failed consume now 302s to /login?authError=…
  // (never raw JSON in the address bar) instead of a 401 JSON body. The single-use consume gate is unchanged.
  test("a forged/replayed/expired state (consume → null) → 302 /login?authError=invalid_state, no token exchange, no session", async () => {
    const h = callbackDeps(() => Promise.resolve(null));
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ state: "forged", code: "grant" }) }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?authError=invalid_state");
    expect(h.getConfigCalls()).toBe(0); // never reached the IdP token exchange
    expect(h.exchangeCalls()).toBe(0); // #867 — asserted at the seam itself, not by proxy
    expect(h.session.createdFor).toBeNull(); // no session minted
  });

  test("a missing state param (empty consume key) → 302 invalid_state (the callback fails closed)", async () => {
    const h = callbackDeps(() => Promise.resolve(null));
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ code: "grant" }) }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?authError=invalid_state");
    expect(h.consumedWith()).toBe(""); // no `state` query → the empty-string consume key → null → redirect
    expect(h.getConfigCalls()).toBe(0);
    expect(h.exchangeCalls()).toBe(0);
  });
});

// The callback fails GRACEFULLY (a redirect, no session) — not 500 — when the IdP redirects back with a
// standard `?error=` (declined consent / access_denied). The txn is consumed FIRST (single-use preserved),
// THEN the IdP error short-circuits BEFORE the token exchange, so neither `getConfig` nor `exchange` is
// reached and no cookie mints. The token-exchange THROW path (replayed/expired code, mismatch, transient
// IdP fault) shares the SAME fail-closed handler and is pinned directly in the #867 describe below.
describe("OIDC callback — IdP error param fails closed (declined consent / access_denied)", () => {
  const callbackBase = "https://app.example/api/auth/oidc/callback";
  const tx: OidcTransaction = { state: "s1", codeVerifier: "cv1", nonce: "n1", redirectUri: callbackBase, createdAt: NOW };
  const callbackUrl = (query: Record<string, string>): string => {
    const u = new URL(callbackBase);
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, v);
    }
    return u.href;
  };

  function errorCallbackDeps(): {
    deps: AuthRoutesDeps;
    session: SessionRecorder;
    getConfigCalls: () => number;
    exchangeCalls: () => number;
    consumed: () => number;
  } {
    let getConfigCalls = 0;
    let exchangeCalls = 0;
    let consumed = 0;
    const session = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: session.sessions,
      sockets: session.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: {
        // Must NOT run on an IdP-error callback — the redirect short-circuits before the token exchange.
        getConfig: (): Promise<never> => {
          getConfigCalls += 1;
          return Promise.reject(new Error("getConfig must not run on an IdP-error callback"));
        },
        exchange: neverExchange(() => {
          exchangeCalls += 1;
        }),
        redirectAllowlist: [callbackBase],
        scope: "openid profile email",
        claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
        groupsSeparator: ";",
        allowJitProvision: true,
        requireApproval: false,
        store: {
          mint: (): Promise<void> => Promise.resolve(),
          // The single-use consume STILL fires on the error path — a failed login must not leave a replayable txn.
          consume: (): Promise<OidcTransaction | null> => {
            consumed += 1;
            return Promise.resolve(tx);
          },
        },
      },
    };
    return { deps, session, getConfigCalls: () => getConfigCalls, exchangeCalls: () => exchangeCalls, consumed: () => consumed };
  }

  test("valid state + `?error=access_denied` → 302 /login?authError=access_denied (not 500), txn consumed, no token exchange, no session", async () => {
    const h = errorCallbackDeps();
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ state: "s1", error: "access_denied" }) }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?authError=access_denied"); // the sanitized standard code
    expect(h.consumed()).toBe(1); // single-use txn consume STILL happened (not replayable)
    expect(h.getConfigCalls()).toBe(0); // never reached the token exchange
    expect(h.exchangeCalls()).toBe(0); // #867 — and the exchange seam itself was never invoked
    expect(h.session.createdFor).toBeNull(); // no session minted
    expect(res.headers.get("set-cookie")).toBeNull(); // no partial cookie on the error path
  });

  test("a malformed IdP `error` value is NOT reflected raw — replaced by a generic marker in the redirect", async () => {
    const h = errorCallbackDeps();
    // Free-text with spaces / punctuation must never reach the Location (reflection guard).
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ state: "s1", error: "<script>alert(1)</script>" }) }));
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("<script>");
    expect(location).toBe("/login?authError=token_exchange_failed"); // the generic fallback marker
  });
});

// ── #867 — THE TOKEN-EXCHANGE SEAM AND EVERYTHING DOWNSTREAM OF IT ───────────────────────────────────
//
// Until the exchange was injected, this whole half of the callback was undrivable in-process: the grant was
// a module-level `openid-client` import, the package resolves only under `packages/server/node_modules` (so
// a `vi.mock("openid-client")` from `tests/` never binds — the real library runs and every arm reports
// `token_exchange_failed` while LOOKING wired), and the path-form mock that WOULD bind is correctly RED
// under `test-mock-doctrine`. So the callback's happy path, the #141 `idToken → sessions.create` hop, the
// #699 subject refusal at the route, and all three provisioning outcomes were asserted nowhere.
//
// With `OidcRoutesDeps.exchange` they are ordinary injected-dep tests. What each arm is FOR:
//   • the mint arm is the #141 hop — the raw id_token the IdP returned must arrive at `sessions.create`
//     VERBATIM (the domain seals it there; a route that dropped it degrades every later logout to a bare
//     end-session URL and silently resurrects the #437 papercut).
//   • the failure arms are the FAIL-CLOSED contract: a throwing exchange must mint no session and set no
//     cookie, must not 500, and must never reflect IdP- or exception-supplied text into the Location.
//   • the refusal arms (#699 no-subject, denied, account-exists, disabled) are reachable end-to-end here
//     for the first time — each must land on its own authError code with no session.
// NOT re-asserted, deliberately: the grant's CRYPTOGRAPHY (JWKS signature, issuer/audience, nonce/PKCE
// binding). That is `openid-client`'s job; ours is to hand it the right inputs and fail closed.
describe("OIDC callback — the injected code→token exchange (#867)", () => {
  const callbackBase = "https://app.example/api/auth/oidc/callback";
  /** The URL the request actually arrives on behind a proxy — a DIFFERENT origin from the allowlisted one
   *  the transaction stored. The exchange must be presented the STORED one (see the mint-arm test). */
  const proxyCallback = "https://proxy.internal/api/auth/oidc/callback";
  const storedTx: OidcTransaction = { state: "s1", codeVerifier: "cv1", nonce: "n1", redirectUri: callbackBase, createdAt: NOW };
  /** A verified-claims stand-in: a usable username AND the stable subject `oidcSessionIdentity` requires. */
  const verifiedClaims: Record<string, unknown> = { preferred_username: "alice", sub: "sub-alice", email: "alice@corp.example", groups: ["staff"] };
  const authedUser = castId<UserId>("usr_x");

  const arriveAt = (base: string, query: Record<string, string>): string => {
    const u = new URL(base);
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, v);
    }
    return u.href;
  };

  interface ExchangeHarness {
    readonly deps: AuthRoutesDeps;
    readonly session: SessionRecorder;
    /** What the route handed the exchange — the reconstructed URL and the transaction it consumed. */
    readonly seen: () => { url: URL; tx: OidcTransaction } | null;
    readonly consumed: () => number;
  }

  function harness(exchange: Exchange, provisionIdentity?: AuthSessionsPort["provisionIdentity"]): ExchangeHarness {
    let seen: { url: URL; tx: OidcTransaction } | null = null;
    let consumed = 0;
    const session = recordingSessions();
    const sessions: AuthSessionsPort = provisionIdentity === undefined ? session.sessions : { ...session.sessions, provisionIdentity };
    const deps: AuthRoutesDeps = {
      sessions,
      sockets: session.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: fakeOidcDeps({
        getConfig: (): Promise<OidcConfig> => Promise.resolve(fakeConfig({ issuer: "https://idp.example" })),
        redirectAllowlist: [callbackBase],
        exchange: (config: OidcConfig, url: URL, tx: OidcTransaction): Promise<OidcVerifiedTokens> => {
          seen = { url, tx };
          return exchange(config, url, tx);
        },
        store: {
          mint: (): Promise<void> => Promise.resolve(),
          consume: (): Promise<OidcTransaction | null> => {
            consumed += 1;
            return Promise.resolve(storedTx);
          },
        },
      }),
    };
    return { deps, session, seen: (): { url: URL; tx: OidcTransaction } | null => seen, consumed: (): number => consumed };
  }

  /** An exchange that succeeds with the given claims + id_token — the shape `authorizationCodeGrant`
   *  narrows to once it has verified the response. */
  const grants =
    (claims: Record<string, unknown> | undefined, idToken: string | null): Exchange =>
    (): Promise<OidcVerifiedTokens> =>
      Promise.resolve({ claims, idToken });

  /** An exchange that rejects — the replayed/expired code, mismatch and transient-fault class. */
  const rejects =
    (err: unknown): Exchange =>
    (): Promise<never> =>
      Promise.reject(err);

  const drive = async (h: ExchangeHarness, url: string): Promise<Response> => await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url }));

  // THE #141 HOP. This is the assertion the whole seam exists for: `createdIdToken` is what
  // `sessions.create` was handed, and the domain seals exactly that value against the new row id.
  test("a verified grant mints the session and threads the id_token to sessions.create VERBATIM", async () => {
    const h = harness(grants(verifiedClaims, ID_TOKEN));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain(`${COOKIE}=tok-123`);
    expect(h.session.createdFor).toBe(authedUser);
    expect(h.session.createdIdToken).toBe(ID_TOKEN); // #141 — the hop that had no pin before #867
    expect(h.consumed()).toBe(1); // the PKCE txn is still spent exactly once
  });

  // #2413 — a MINT writes the live cookie under the active name FIRST, then clears the other posture's name,
  // as two separate `Set-Cookie` headers. Order matters for the reader of a joined header, and the append is
  // what keeps the mint from being overwritten by its own hygiene clear.
  test("the mint writes the live cookie AND clears the other posture's name, in that order", async () => {
    const h = harness(grants(verifiedClaims, ID_TOKEN));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain(`${SESSION_COOKIE_NAME_SECURE}=tok-123`);
    expect(cookies[0]).not.toContain("Max-Age=0");
    expect(cookies[1]).toContain(`${SESSION_COOKIE_NAME_INSECURE}=;`);
    expect(cookies[1]).toContain("Max-Age=0");
  });

  // The redirect_uri presented at the exchange must be the ALLOWLIST-VALIDATED one stored in the
  // transaction, never the origin the request happened to arrive on — otherwise a proxy (or an attacker
  // who can influence the arrival URL) changes the value the IdP is asked to match.
  test("the exchange is handed the STORED redirect_uri (not the arrival origin) and the consumed transaction", async () => {
    const h = harness(grants(verifiedClaims, ID_TOKEN));
    await drive(h, arriveAt(proxyCallback, { state: "s1", code: "grant" }));

    const seen = h.seen();
    expect(seen).not.toBeNull();
    expect(`${seen?.url.origin}${seen?.url.pathname}`).toBe(callbackBase);
    expect(seen?.url.href).not.toContain("proxy.internal");
    expect(seen?.url.searchParams.get("code")).toBe("grant"); // the incoming query still rides
    // The whole transaction crosses the seam, so the PKCE verifier + nonce + state are all presented.
    expect(seen?.tx).toEqual(storedTx);
  });

  // An IdP that returns no ID token must still log the user in — the DEGRADE #141 documents (that
  // session's logout gets a bare end-session URL) — and must store nothing rather than sealing "".
  test("a grant with no id_token still mints the session, carrying null (the documented #141 degrade)", async () => {
    const h = harness(grants(verifiedClaims, null));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(h.session.createdFor).toBe(authedUser);
    expect(h.session.createdIdToken).toBeNull();
  });

  test("a THROWING exchange (replayed/expired code) mints no session, sets no cookie, and 302s with the sanitized code", async () => {
    const h = harness(rejects({ error: "invalid_grant" }));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "replayed" }));

    expect(res.status).toBe(302); // fail-closed, not a 500 leaking a stack through onError
    expect(res.headers.get("location")).toBe("/login?authError=invalid_grant");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.session.createdFor).toBeNull();
    expect(h.consumed()).toBe(1); // and the txn stays spent — a failed exchange leaves nothing replayable
  });

  test("an exchange error carrying FREE TEXT is not reflected — the generic marker rides instead", async () => {
    const h = harness(rejects({ error: "<script>alert(1)</script>" }));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("<script>");
    expect(location).toBe("/login?authError=token_exchange_failed");
    expect(h.session.createdFor).toBeNull();
  });

  // A thrown exception's MESSAGE is attacker-influenceable in the general case (an HTTP client happily
  // quotes a response body into it) and, worse, can carry our own secrets. Neither the Location nor the
  // body may echo it.
  test("nothing from the thrown error's message reaches the redirect or the body", async () => {
    const h = harness(rejects(new Error(`token endpoint said: ${ID_TOKEN}`)));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?authError=token_exchange_failed");
    expect(res.headers.get("location") ?? "").not.toContain(ID_TOKEN);
    expect(await res.text()).not.toContain(ID_TOKEN);
    expect(h.session.createdFor).toBeNull();
  });

  // #699 — reachable END-TO-END for the first time: a verified grant whose claims carry no stable subject
  // (OIDC_UID_CLAIM names a claim this IdP does not emit) is refused at the callback, not walked onto
  // whatever row holds that handle.
  test("a verified grant with NO stable subject is refused fail-closed — no session (#699)", async () => {
    const h = harness(grants({ preferred_username: "alice" }, ID_TOKEN));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?authError=no_identity");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.session.createdFor).toBeNull();
  });

  test("a grant with NO usable username is refused too (the pre-existing null-identity arm)", async () => {
    const h = harness(grants({ sub: "sub-only" }, ID_TOKEN));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.headers.get("location")).toBe("/login?authError=no_identity");
    expect(h.session.createdFor).toBeNull();
  });

  test("a DENIED provision (login gate refused) mints nothing — generic not_authorized", async () => {
    const h = harness(grants(verifiedClaims, ID_TOKEN), () => Promise.resolve({ outcome: "denied" as const }));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.headers.get("location")).toBe("/login?authError=not_authorized");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.session.createdFor).toBeNull();
  });

  // MS-W1 — the collision hard-deny gets its OWN operator-actionable code so the login surface can say
  // "ask an admin to link the account" instead of the generic refusal.
  test("an ACCOUNT-EXISTS collision deny surfaces its distinct code, still with no session", async () => {
    const h = harness(grants(verifiedClaims, ID_TOKEN), () => Promise.resolve({ outcome: "denied" as const, reason: "account-exists" as const }));
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.headers.get("location")).toBe("/login?authError=account_exists");
    expect(h.session.createdFor).toBeNull();
  });

  // A2 — provisioned-but-awaiting-approval (or admin-disabled). Provisioning SUCCEEDS; the mint must not.
  test("a provisioned but DISABLED account mints no session", async () => {
    const h = harness(grants(verifiedClaims, ID_TOKEN), () =>
      Promise.resolve({ outcome: "provisioned" as const, userId: authedUser, enabled: false, role: "user" as const, identityChanged: false }),
    );
    const res = await drive(h, arriveAt(callbackBase, { state: "s1", code: "grant" }));

    expect(res.headers.get("location")).toBe("/login?authError=account_disabled");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.session.createdFor).toBeNull();
  });
});

// A5 — RP back-channel logout ROUTE. The JWKS signature + claim checklist lives in infra/auth/backchannel
// (unit-tested there against a locally-signed token); HERE we prove the route wiring: registration gating,
// the verify→revoke path, and the fail-closed 400s. The verifier is a stub so the route logic is isolated.
describe("OIDC back-channel logout route (A5)", () => {
  const clientId = "orb-client";
  const jwksUri = "https://idp.example/jwks";
  const issuer = "https://idp.example";

  interface BclRecorder {
    revokedExternalId: string | null;
    verifyCalls: number;
    /** W7a — the users whose live sockets the back-channel logout evicted (per USER: the IdP ended the human). */
    evictedUsers: UserId[];
  }

  type Bcl = NonNullable<OidcRoutesDeps["backchannelLogout"]>;

  function bclDeps(over: { verify?: Bcl; revokeReturns?: number; revokedUserIds?: readonly UserId[] }): { deps: AuthRoutesDeps; rec: BclRecorder } {
    const rec: BclRecorder = { revokedExternalId: null, verifyCalls: 0, evictedUsers: [] };
    const sessions: AuthSessionsPort = {
      ...recordingSessions().sessions,
      revokeByExternalId: (externalId): Promise<RevokedSessionsSummary> => {
        rec.revokedExternalId = externalId;
        return Promise.resolve({ revoked: over.revokeReturns ?? 1, userIds: over.revokedUserIds ?? [] });
      },
    };
    const sockets: SessionSocketEviction = {
      evictSession: (): number => 0,
      evictUser: (userId): number => {
        rec.evictedUsers.push(userId);
        return 1;
      },
    };
    const backchannelLogout: Bcl = over.verify ?? {
      clientId,
      verify: () => {
        rec.verifyCalls += 1;
        return Promise.resolve({ sub: "authentik|alice", sid: null });
      },
    };
    const oidc = fakeOidcDeps({
      getConfig: () => Promise.resolve(fakeConfig({ issuer, jwks_uri: jwksUri })),
      backchannelLogout,
    });
    return { deps: { sessions, sockets, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10, oidc }, rec };
  }

  test("route is NOT registered without backchannelLogout deps (default OFF)", () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
      sockets: rec.sockets,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: fakeOidcDeps(),
    };
    expect(routesOf(deps).has("POST /api/auth/oidc/backchannel-logout")).toBe(false);
  });

  test("route IS registered when backchannelLogout is supplied (OIDC_BACKCHANNEL_LOGOUT=on)", () => {
    const { deps } = bclDeps({});
    expect(routesOf(deps).has("POST /api/auth/oidc/backchannel-logout")).toBe(true);
  });

  test("the back-channel route registers a body-cap middleware before its handler", () => {
    const { deps } = bclDeps({});
    expect(registeredHandlerCount(deps, "POST /api/auth/oidc/backchannel-logout")).toBe(2);
  });

  test("a valid logout_token → verify → revoke every session for the subject → 200, Cache-Control no-store", async () => {
    const { deps, rec } = bclDeps({});
    const res = await handlerFor(deps, "POST /api/auth/oidc/backchannel-logout")(makeCtx({ parseBody: { logout_token: "signed.jwt.here" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rec.verifyCalls).toBe(1);
    expect(rec.revokedExternalId).toBe("authentik|alice");
  });

  // W7a — the revoke kills the cookies; this kills the STREAMS those cookies already opened. PER USER here
  // (not per session): the IdP has ended the HUMAN's login, and one subject can be bound to more than one row.
  test("W7a a back-channel logout EVICTS the live sockets of every user it revoked", async () => {
    const alice = castId<UserId>("usr_alice");
    const alsoAlice = castId<UserId>("usr_alice_second_row");
    const { deps, rec } = bclDeps({ revokeReturns: 3, revokedUserIds: [alice, alsoAlice] });

    await handlerFor(deps, "POST /api/auth/oidc/backchannel-logout")(makeCtx({ parseBody: { logout_token: "signed.jwt.here" } }));

    expect(rec.evictedUsers).toEqual([alice, alsoAlice]);
  });

  test("W7a a RE-DELIVERED logout token names no users, so it evicts nothing (idempotent)", async () => {
    const { deps, rec } = bclDeps({ revokeReturns: 0, revokedUserIds: [] });

    await handlerFor(deps, "POST /api/auth/oidc/backchannel-logout")(makeCtx({ parseBody: { logout_token: "signed.jwt.here" } }));

    expect(rec.evictedUsers).toEqual([]);
  });

  test("a missing logout_token → 400, no verify, no revoke", async () => {
    const { deps, rec } = bclDeps({});
    const res = await handlerFor(deps, "POST /api/auth/oidc/backchannel-logout")(makeCtx({ parseBody: {} }));
    expect(res.status).toBe(400);
    expect(rec.verifyCalls).toBe(0);
    expect(rec.revokedExternalId).toBeNull();
  });

  test("a logout_token that FAILS validation (verify → null) → 400, no revoke", async () => {
    const failing: Bcl = { clientId, verify: () => Promise.resolve(null) };
    const { deps, rec } = bclDeps({ verify: failing });
    const res = await handlerFor(deps, "POST /api/auth/oidc/backchannel-logout")(makeCtx({ parseBody: { logout_token: "forged.jwt" } }));
    expect(res.status).toBe(400);
    expect(rec.revokedExternalId).toBeNull();
  });

  test("a sid-only token is explicitly refused while sessions have no issuer/sid binding", async () => {
    const sidOnly: Bcl = { clientId, verify: () => Promise.resolve({ sub: null, sid: "sess-1" }) };
    const { deps, rec } = bclDeps({ verify: sidOnly });
    const res = await handlerFor(deps, "POST /api/auth/oidc/backchannel-logout")(makeCtx({ parseBody: { logout_token: "sid.only.jwt" } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "unsupported_logout_token" });
    expect(rec.revokedExternalId).toBeNull(); // nothing to revoke — no sub
  });
});
