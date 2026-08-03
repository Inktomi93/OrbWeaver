// Integration: the login route's BEHAVIORAL belts over a REAL Hono app + a freshDb — the per-IP login
// throttle (DB-backed `rate_limit_buckets`, replica-correct), the 4 KiB body cap, and the mint/verify
// paths. These need a live limiter (db) + a real conninfo env for `clientIp`, so they run here rather than
// on the pure mock harness in auth-routes.test.ts. Determinism: the throttle window is pinned via `now`.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthRoutesDeps, AuthSessionsPort, LocalAuthenticator } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const THIRTY_DAYS_MS = 2_592_000_000;
const COOKIE = "__Host-orb_session";
const CSRF = "x-orb-csrf";
const LOGIN = "/api/auth/login";
// Distinct fake TCP peers so per-IP throttle buckets don't collide across tests (each test keys its own IP).
const connEnv = (addr: string): { incoming: { socket: { remoteAddress: string; remotePort: number; remoteFamily: string } } } => ({
  incoming: { socket: { remoteAddress: addr, remotePort: 40_000, remoteFamily: "IPv4" } },
});

function sessionsStub(over: Partial<AuthSessionsPort> = {}): AuthSessionsPort {
  return {
    create: (): Promise<{ token: SessionToken; expiresAt: number }> =>
      Promise.resolve({ token: castId<SessionToken>("tok-123"), expiresAt: NOW + THIRTY_DAYS_MS }),
    revokeByToken: (): Promise<void> => Promise.resolve(),
    provisionIdentity: (
      _identity: ResolvedIdentity,
    ): Promise<{ outcome: "provisioned"; userId: UserId; enabled: boolean; role: UserRole } | { outcome: "denied" }> =>
      Promise.resolve({ outcome: "provisioned", userId: castId<UserId>("usr_x"), enabled: true, role: "user" }),
    ...over,
  };
}

const ownerAuth =
  (userId: UserId | null): LocalAuthenticator =>
  (): Promise<UserId | null> =>
    Promise.resolve(userId);

async function appWith(over: Partial<AuthRoutesDeps> = {}): Promise<Hono> {
  const db = await freshDb();
  const app = new Hono();
  const deps: AuthRoutesDeps = {
    sessions: sessionsStub(),
    now: (): number => NOW,
    db,
    resolveLoginLimit: (): number => 10,
    authenticate: ownerAuth(castId<UserId>("usr_owner")),
    ...over,
  };
  registerAuthRoutes(app, deps);
  return app;
}

/** POST a form-encoded login body from a given fake peer IP. */
async function postLogin(app: Hono, ip: string, body: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return await app.request(
    LOGIN,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...extraHeaders },
      body: new URLSearchParams(body).toString(),
    },
    connEnv(ip),
  );
}

describe("local login — behavioral (real app + freshDb)", () => {
  test("valid credentials → 200 + the __Host- session cookie", async () => {
    const app = await appWith();
    const res = await postLogin(app, "10.0.0.1", { handle: "owner", password: "hunter2pw" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain(`${COOKIE}=tok-123`);
  });

  test("bad credentials → 401, no cookie", async () => {
    const app = await appWith({ authenticate: ownerAuth(null) });
    const res = await postLogin(app, "10.0.0.2", { handle: "owner", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("missing fields → 400", async () => {
    const app = await appWith();
    const res = await postLogin(app, "10.0.0.3", { handle: "owner" });
    expect(res.status).toBe(400);
  });
});

describe("login throttle — 10/min/IP (brute-force + scrypt-flood cap)", () => {
  test("the 11th attempt from one IP → 429 with Retry-After; other IPs are unaffected", async () => {
    const app = await appWith({ authenticate: ownerAuth(null) });
    const attacker = "203.0.113.10";
    // 10 wrong-password attempts are allowed (each 401), the 11th is throttled.
    for (let i = 0; i < 10; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the throttle counts SEQUENTIAL attempts — parallel calls would race the fixed-window increment.
      const res = await postLogin(app, attacker, { handle: "owner", password: "wrong" });
      expect(res.status).toBe(401);
    }
    const throttled = await postLogin(app, attacker, { handle: "owner", password: "wrong" });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).not.toBeNull();

    // A different IP shares the same app/db but its own bucket — not throttled.
    const other = await postLogin(app, "203.0.113.11", { handle: "owner", password: "wrong" });
    expect(other.status).toBe(401);
  });

  test("the throttle fires BEFORE credential verification (a valid login is refused once over budget)", async () => {
    // Even correct credentials are refused when the IP is over budget — the throttle is the outer gate,
    // so a brute-forcer can't slip a lucky guess through after exhausting attempts.
    const app = await appWith({ authenticate: ownerAuth(castId<UserId>("usr_owner")) });
    const ip = "203.0.113.20";
    for (let i = 0; i < 10; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential — see above.
      await postLogin(app, ip, { handle: "owner", password: "hunter2pw" });
    }
    const res = await postLogin(app, ip, { handle: "owner", password: "hunter2pw" });
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("login body cap — 4 KiB", () => {
  test("an oversized body → 413 (rejected before scrypt / credential work)", async () => {
    const app = await appWith();
    // A password field well over 4 KiB — the body-limit belt returns 413 before the handler runs.
    const huge = "x".repeat(5 * 1024);
    const res = await postLogin(app, "198.51.100.5", { handle: "owner", password: huge });
    expect(res.status).toBe(413);
  });

  test("a normal-sized body is under the cap → processed", async () => {
    const app = await appWith();
    const res = await postLogin(app, "198.51.100.6", { handle: "owner", password: "hunter2pw" });
    expect(res.status).toBe(200);
  });
});

describe("logout — CSRF gate (real app)", () => {
  test("cross-site force-logout: cookie present but NO CSRF header → 403, no revoke", async () => {
    let revoked: string | null = null;
    const app = await appWith({
      sessions: sessionsStub({
        revokeByToken: (t: string): Promise<void> => {
          revoked = t;
          return Promise.resolve();
        },
      }),
    });
    const res = await app.request("/api/auth/logout", { method: "POST", headers: { cookie: `${COOKIE}=tok-123` } }, connEnv("10.0.0.9"));
    expect(res.status).toBe(403);
    expect(revoked).toBeNull();
  });

  test("with the CSRF header → revokes + clears (204)", async () => {
    let revoked: string | null = null;
    const app = await appWith({
      sessions: sessionsStub({
        revokeByToken: (t: string): Promise<void> => {
          revoked = t;
          return Promise.resolve();
        },
      }),
    });
    const res = await app.request("/api/auth/logout", { method: "POST", headers: { cookie: `${COOKIE}=tok-123`, [CSRF]: "1" } }, connEnv("10.0.0.10"));
    expect(res.status).toBe(204);
    expect(revoked).toBe("tok-123");
    expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });
});
