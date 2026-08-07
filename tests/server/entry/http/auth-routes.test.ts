// biome-ignore-all lint/style/useNamingConvention: OIDC ID-token claim names (preferred_username, …) are
// wire-fixed snake_case by the OIDC spec; the crafted claims objects must match that external shape.
// entry/http/auth-routes — the auth mint routes + cookie I/O. Pins: the `__Host-orb_session` cookie shape
// (Secure + host-only + Path=/ + HttpOnly + SameSite=Lax; Max-Age from the injected clock); local login
// (verify → sessions.create → set cookie; 401/400 paths); logout (revoke + clear); and the mode-conditional
// registration (login present only with `authenticate`, OIDC present only with `oidc`). Hono isn't
// test-resolvable, so the registrar runs over a captured mock app + context.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthRoutesDeps, AuthSessionsPort, LocalAuthenticator, OidcClaimMap, OidcRoutesDeps } from "@orb/server/entry/http";
import { deriveRedirectUri, identityFromClaims, registerAuthRoutes, serializeClearedSessionCookie, serializeSessionCookie } from "@orb/server/entry/http";
import type { OidcTransaction } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const THIRTY_DAYS_MS = 2_592_000_000;
const COOKIE = "__Host-orb_session";

interface MockReq {
  readonly headers?: Record<string, string>;
  readonly parseBody?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly url?: string;
}
interface MockCtx {
  readonly header: (name: string, value: string) => void;
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
    header: (name: string, value: string): void => {
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
// FABRICATION-OK: never-dereferenced registration-only stand-in.
const STUB_DB = {} as unknown as Db;

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

interface SessionRecorder {
  readonly sessions: AuthSessionsPort;
  createdFor: UserId | null;
  createdUa: string | null | undefined;
  revoked: string | null;
}
function recordingSessions(): SessionRecorder {
  const rec: SessionRecorder = {
    createdFor: null,
    createdUa: undefined,
    revoked: null,
    sessions: {
      create: (p): Promise<{ token: SessionToken; expiresAt: number }> => {
        rec.createdFor = p.userId;
        rec.createdUa = p.userAgent;
        return Promise.resolve({ token: castId<SessionToken>("tok-123"), expiresAt: NOW + THIRTY_DAYS_MS });
      },
      revokeByToken: (token: SessionToken): Promise<void> => {
        rec.revoked = token;
        return Promise.resolve();
      },
      provisionIdentity: (
        _identity: ResolvedIdentity,
      ): Promise<{ outcome: "provisioned"; userId: UserId; enabled: boolean; role: UserRole } | { outcome: "denied" }> =>
        Promise.resolve({
          outcome: "provisioned",
          userId: castId<UserId>("usr_x"),
          enabled: true,
          role: "user",
        }),
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

  test("serializeClearedSessionCookie expires immediately", () => {
    const cookie = serializeClearedSessionCookie();
    expect(cookie).toContain(`${COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
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
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    expect(routesOf(deps).has("POST /api/auth/login")).toBe(false);
  });

  test("login route IS registered with an authenticator", () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
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
  const CSRF = "x-orb-csrf";

  test("WITHOUT the CSRF header → 403, does NOT revoke (blocks cross-site force-logout)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123` } }));
    expect(res.status).toBe(403);
    expect(rec.revoked).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("WITH the CSRF header + a session cookie → revokes the token + clears the cookie (204)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { cookie: `${COOKIE}=tok-123`, [CSRF]: "1" } }));
    expect(res.status).toBe(204);
    expect(rec.revoked).toBe("tok-123");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("WITH the CSRF header but no cookie → still clears, does not revoke (204)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({ headers: { [CSRF]: "1" } }));
    expect(res.status).toBe(204);
    expect(rec.revoked).toBeNull();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
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

describe("OIDC route registration", () => {
  const oidcStub = (): OidcRoutesDeps =>
    ({
      getConfig: (): Promise<null> => Promise.resolve(null),
      redirectAllowlist: ["https://app.example/api/auth/oidc/callback"],
      scope: "openid profile",
      claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups" },
      store: {
        mint: (): Promise<void> => Promise.resolve(),
        consume: (): Promise<null> => Promise.resolve(null),
      },
    }) as unknown as OidcRoutesDeps;

  test("OIDC routes present only when oidc deps are supplied", () => {
    const rec = recordingSessions();
    const withoutOidc: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW, db: STUB_DB, resolveLoginLimit: (): number => 10 };
    expect(routesOf(withoutOidc).has("GET /api/auth/oidc/login")).toBe(false);

    const withOidc: AuthRoutesDeps = {
      sessions: rec.sessions,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: oidcStub(),
    };
    const routes = routesOf(withOidc);
    expect(routes.has("GET /api/auth/oidc/login")).toBe(true);
    expect(routes.has("GET /api/auth/oidc/callback")).toBe(true);
  });
});

describe("deriveRedirectUri — origin-flexible, allowlist-gated (open-redirect guard)", () => {
  const FQDN = "https://chat.example.com/api/auth/oidc/callback";
  const LAN = "https://192.168.1.10/api/auth/oidc/callback";
  const LOCAL = "https://localhost:8788/api/auth/oidc/callback";
  const allow = [FQDN, LAN, LOCAL];
  const h = (init: Record<string, string>): Headers => new Headers(init);

  test("public FQDN via X-Forwarded-Proto/Host → the allowlisted callback", () => {
    const derived = deriveRedirectUri(h({ "x-forwarded-proto": "https", "x-forwarded-host": "chat.example.com" }), allow);
    expect(derived).toBe(FQDN);
  });

  test("a LAN-IP origin (raw Host, no proxy headers) derives + matches", () => {
    expect(deriveRedirectUri(h({ host: "192.168.1.10" }), allow)).toBe(LAN);
  });

  test("a localhost origin derives + matches", () => {
    expect(deriveRedirectUri(h({ host: "localhost:8788" }), allow)).toBe(LOCAL);
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
    expect(derived).toBe(FQDN);
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
        redirectAllowlist: allowlist,
        scope: "openid profile email",
        claims: {
          usernameClaim: "preferred_username",
          uidClaim: "sub",
          groupsClaim: "groups",
          emailClaim: "email",
        },
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
// returned `state` BEFORE any token work; a null consume (forged / replayed / TTL-expired state) 401s and
// NEVER reaches the IdP token exchange. This is the one callback branch unit-testable without a live IdP:
// the TOKEN-EXCHANGE side (authorizationCodeGrant → JWKS signature + issuer-mismatch + nonce/state checks)
// is a module-level `openid-client` import, not an injected dep, and verifying it needs a real signed
// ID-token + JWKS endpoint (a full IdP) or a banned module mock — so JWKS/issuer verification is
// deliberately delegated to the audited `openid-client` primitive and asserted only up to this gate.
// Downstream provisioning (denied → 401 / disabled → 403 / provisioned → mint) sits AFTER that exchange
// and is likewise unreachable here without exercising the real grant. Flagged for a route-level int test
// (real IdP fixture) if that coverage is wanted.
describe("OIDC callback — single-use state consume (replay/forgery/TTL gate)", () => {
  const CALLBACK_BASE = "https://app.example/api/auth/oidc/callback";
  // Build a callback URL with a query so no long literal trips the noSecrets entropy heuristic.
  const callbackUrl = (query: Record<string, string>): string => {
    const u = new URL(CALLBACK_BASE);
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, v);
    }
    return u.href;
  };

  function callbackDeps(consume: (state: string) => Promise<OidcTransaction | null>): {
    deps: AuthRoutesDeps;
    getConfigCalls: () => number;
    session: SessionRecorder;
    consumedWith: () => string | null;
  } {
    let getConfigCalls = 0;
    let consumedWith: string | null = null;
    const session = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: session.sessions,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: {
        // Must NOT run when the state consume fails — the 401 short-circuits before the token exchange.
        getConfig: (): Promise<never> => {
          getConfigCalls += 1;
          return Promise.reject(new Error("getConfig must not run on a failed state consume"));
        },
        redirectAllowlist: [CALLBACK_BASE],
        scope: "openid profile email",
        claims: {
          usernameClaim: "preferred_username",
          uidClaim: "sub",
          groupsClaim: "groups",
          emailClaim: "email",
        },
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
      session,
      consumedWith: () => consumedWith,
    };
  }

  test("a forged/replayed/expired state (consume → null) → 401, no token exchange, no session", async () => {
    const h = callbackDeps(() => Promise.resolve(null));
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ state: "forged", code: "grant" }) }));
    expect(res.status).toBe(401);
    expect(h.getConfigCalls()).toBe(0); // never reached the IdP token exchange
    expect(h.session.createdFor).toBeNull(); // no session minted
  });

  test("a missing state param (empty consume key) → 401 (the callback fails closed)", async () => {
    const h = callbackDeps(() => Promise.resolve(null));
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ code: "grant" }) }));
    expect(res.status).toBe(401);
    expect(h.consumedWith()).toBe(""); // no `state` query → the empty-string consume key → null → 401
    expect(h.getConfigCalls()).toBe(0);
  });
});

// The callback fails GRACEFULLY (4xx, no session) — not 500 — when the IdP redirects back with a standard
// `?error=` (declined consent / access_denied). The txn is consumed FIRST (single-use preserved), THEN the
// IdP error short-circuits BEFORE the token exchange, so `getConfig` is never reached and no cookie mints.
// The token-exchange THROW path (replayed/expired code, transient IdP fault) can't be unit-tested here —
// `authorizationCodeGrant` is a module-level `openid-client` import, not an injected dep (see the R7 note
// above); it shares the SAME fail-closed handler as this `?error=` branch (both route through
// exchangeCodeForClaims / the 401 `oidc login failed:` response).
describe("OIDC callback — IdP error param fails closed (declined consent / access_denied)", () => {
  const CALLBACK_BASE = "https://app.example/api/auth/oidc/callback";
  const tx: OidcTransaction = { state: "s1", codeVerifier: "cv1", nonce: "n1", redirectUri: CALLBACK_BASE, createdAt: NOW };
  const callbackUrl = (query: Record<string, string>): string => {
    const u = new URL(CALLBACK_BASE);
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, v);
    }
    return u.href;
  };

  function errorCallbackDeps(): { deps: AuthRoutesDeps; session: SessionRecorder; getConfigCalls: () => number; consumed: () => number } {
    let getConfigCalls = 0;
    let consumed = 0;
    const session = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: session.sessions,
      now: (): number => NOW,
      db: STUB_DB,
      resolveLoginLimit: (): number => 10,
      oidc: {
        // Must NOT run on an IdP-error callback — the 401 short-circuits before the token exchange.
        getConfig: (): Promise<never> => {
          getConfigCalls += 1;
          return Promise.reject(new Error("getConfig must not run on an IdP-error callback"));
        },
        redirectAllowlist: [CALLBACK_BASE],
        scope: "openid profile email",
        claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
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
    return { deps, session, getConfigCalls: () => getConfigCalls, consumed: () => consumed };
  }

  test("valid state + `?error=access_denied` → 401 (not 500), txn consumed, no token exchange, no session", async () => {
    const h = errorCallbackDeps();
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ state: "s1", error: "access_denied" }) }));
    expect(res.status).toBe(401);
    expect(h.consumed()).toBe(1); // single-use txn consume STILL happened (not replayable)
    expect(h.getConfigCalls()).toBe(0); // never reached the token exchange
    expect(h.session.createdFor).toBeNull(); // no session minted
    expect(res.headers.get("set-cookie")).toBeNull(); // no partial cookie on the error path
    const decoded = JSON.parse(await res.text()) as { error: string };
    expect(decoded.error).toContain("access_denied"); // the sanitized standard code is surfaced
  });

  test("a malformed IdP `error` value is NOT reflected raw — replaced by a generic marker", async () => {
    const h = errorCallbackDeps();
    // Free-text with spaces / punctuation must never reach the response body (reflection guard).
    const res = await handlerFor(h.deps, "GET /api/auth/oidc/callback")(makeCtx({ url: callbackUrl({ state: "s1", error: "<script>alert(1)</script>" }) }));
    expect(res.status).toBe(401);
    const decoded = JSON.parse(await res.text()) as { error: string };
    expect(decoded.error).not.toContain("<script>");
    expect(decoded.error).toContain("token_exchange_failed"); // the generic fallback marker
  });
});
