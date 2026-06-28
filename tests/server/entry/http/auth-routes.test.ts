// entry/http/auth-routes — the auth mint routes + cookie I/O. Pins: the `__Host-orb_session` cookie shape
// (Secure + host-only + Path=/ + HttpOnly + SameSite=Lax; Max-Age from the injected clock); local login
// (verify → sessions.create → set cookie; 401/400 paths); logout (revoke + clear); and the mode-conditional
// registration (login present only with `authenticate`, OIDC present only with `oidc`). Hono isn't
// test-resolvable, so the registrar runs over a captured mock app + context.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthRoutesDeps, AuthSessionsPort, OidcRoutesDeps } from "@orb/server/entry/http";
import {
  registerAuthRoutes,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "@orb/server/entry/http";
import { describe, expect, test } from "vitest";

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
  readonly body: (data: BodyInit | null, status?: number) => Response;
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
  const merge = (
    status: number,
    body: BodyInit | null,
    extra?: Record<string, string>,
  ): Response => {
    const headers = new Headers(out);
    for (const [k, v] of Object.entries(extra ?? {})) {
      headers.set(k, v);
    }
    return new Response(body, { status, headers });
  };
  return {
    header: (name: string, value: string): void => {
      out.set(name, value);
    },
    json: (body: unknown, status = 200): Response =>
      merge(status, JSON.stringify(body), { "content-type": "application/json" }),
    body: (data: BodyInit | null, status = 200): Response => merge(status, data),
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

function routesOf(deps: AuthRoutesDeps): Map<string, Handler> {
  const routes = new Map<string, Handler>();
  const record =
    (method: string) =>
    (path: string, routeHandler: Handler): unknown => {
      routes.set(`${method} ${path}`, routeHandler);
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
      create: (p): Promise<{ token: string; expiresAt: number }> => {
        rec.createdFor = p.userId;
        rec.createdUa = p.userAgent;
        return Promise.resolve({ token: "tok-123", expiresAt: NOW + THIRTY_DAYS_MS });
      },
      revokeByToken: (token: string): Promise<void> => {
        rec.revoked = token;
        return Promise.resolve();
      },
      provisionIdentity: (
        _identity: ResolvedIdentity,
      ): Promise<{ userId: UserId; enabled: boolean; role: UserRole }> =>
        Promise.resolve({ userId: castId<UserId>("usr_x"), enabled: true, role: "user" }),
    },
  };
  return rec;
}

describe("cookie I/O", () => {
  test("serializeSessionCookie carries the full __Host- policy + Max-Age", () => {
    const cookie = serializeSessionCookie("tok-123", THIRTY_DAYS_MS / 1000);
    expect(cookie).toContain(`${COOKIE}=tok-123`);
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    // biome-ignore lint/security/noSecrets: "SameSite=Lax" is a Set-Cookie attribute, not a secret.
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
  (userId: UserId | null): AuthRoutesDeps["authenticate"] =>
  (): Promise<UserId | null> =>
    Promise.resolve(userId);

describe("local login", () => {
  test("valid credentials → 200, sets the session cookie, mints via sessions.create", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
      now: (): number => NOW,
      authenticate: ownerAuth(castId<UserId>("usr_owner")),
    };
    const res = await handlerFor(
      deps,
      "POST /api/auth/login",
    )(
      makeCtx({
        parseBody: { handle: "owner", password: "hunter2pw" },
        headers: { "user-agent": "vitest" },
      }),
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${COOKIE}=tok-123`);
    expect(cookie).toContain("Max-Age=2592000");
    expect(rec.createdFor).toBe("usr_owner");
    expect(rec.createdUa).toBe("vitest");
  });

  test("bad credentials → 401, no cookie", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
      now: (): number => NOW,
      authenticate: ownerAuth(null),
    };
    const res = await handlerFor(
      deps,
      "POST /api/auth/login",
    )(makeCtx({ parseBody: { handle: "owner", password: "wrong-pass" } }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(rec.createdFor).toBeNull();
  });

  test("missing fields → 400", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = {
      sessions: rec.sessions,
      now: (): number => NOW,
      authenticate: ownerAuth(castId<UserId>("usr_owner")),
    };
    const res = await handlerFor(
      deps,
      "POST /api/auth/login",
    )(makeCtx({ parseBody: { handle: "owner" } }));
    expect(res.status).toBe(400);
  });

  test("login route is NOT registered without an authenticator", () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW };
    expect(routesOf(deps).has("POST /api/auth/login")).toBe(false);
  });
});

describe("logout", () => {
  test("with a session cookie → revokes the token + clears the cookie (204)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW };
    const res = await handlerFor(
      deps,
      "POST /api/auth/logout",
    )(makeCtx({ headers: { cookie: `${COOKIE}=tok-123` } }));
    expect(res.status).toBe(204);
    expect(rec.revoked).toBe("tok-123");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("without a cookie → still clears, does not revoke (204)", async () => {
    const rec = recordingSessions();
    const deps: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW };
    const res = await handlerFor(deps, "POST /api/auth/logout")(makeCtx({}));
    expect(res.status).toBe(204);
    expect(rec.revoked).toBeNull();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("OIDC route registration", () => {
  const oidcStub = (): OidcRoutesDeps =>
    ({
      getConfig: (): Promise<null> => Promise.resolve(null),
      redirectUri: "https://app.example/cb",
      scope: "openid profile",
      store: {
        mint: (): Promise<void> => Promise.resolve(),
        consume: (): Promise<null> => Promise.resolve(null),
      },
    }) as unknown as OidcRoutesDeps;

  test("OIDC routes present only when oidc deps are supplied", () => {
    const rec = recordingSessions();
    const withoutOidc: AuthRoutesDeps = { sessions: rec.sessions, now: (): number => NOW };
    expect(routesOf(withoutOidc).has("GET /api/auth/oidc/login")).toBe(false);

    const withOidc: AuthRoutesDeps = {
      sessions: rec.sessions,
      now: (): number => NOW,
      oidc: oidcStub(),
    };
    const routes = routesOf(withOidc);
    expect(routes.has("GET /api/auth/oidc/login")).toBe(true);
    expect(routes.has("GET /api/auth/oidc/callback")).toBe(true);
  });
});
