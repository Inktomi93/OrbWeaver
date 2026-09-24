// Integration: the login route's BEHAVIORAL belts over a REAL Hono app + a freshDb — the per-IP login
// throttle (DB-backed `rate_limit_buckets`, replica-correct), the 4 KiB body cap, and the mint/verify
// paths. These need a live limiter (db) + a real conninfo env for `clientIp`, so they run here rather than
// on the pure mock harness in auth-routes.test.ts. Determinism: the throttle window is pinned via `now`.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RevokedSessionsSummary } from "@orb/server/domain/sessions";
import type { AuthRoutesDeps, AuthSessionsPort, FirstRunRouteDeps, LocalAuthenticator } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import { ownerFallbackAllowed } from "@orb/server/infra/auth";
import { Hono } from "hono";
import { describe, vi } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const THIRTY_DAYS_MS = 2_592_000_000;
const COOKIE = "__Host-orb_session";
const CSRF = "x-orb-csrf";
const LOGIN = "/api/auth/login";
// The route's own fixed-window size (`LOGIN_WINDOW_MS`, module-private there) — mirrored so the rollover arm
// below can step the injected clock past a window boundary deterministically.
const LOGIN_WINDOW_MS = 60_000;
/** B1 — a deliberately TIGHT per-IP cap for the handle-axis arms (see that describe's header). */
const IP_CAP = 2;
/** IP_CAP × the route's `LOGIN_HANDLE_LIMIT_MULTIPLIER` — the handle cap sits ABOVE the per-IP one. */
const HANDLE_CAP = IP_CAP * 3;
const VICTIM_HANDLE = castId<Handle>("victim");
/** The session row a logout ends — the id `revokeByToken` reports so the route can evict its sockets. */
const REVOKED_SESSION_ID = castId<SessionId>("sess_logout");
/** #141 — what `revokeByToken` now reports: the ended row + its OIDC end-session hint (none in these arms). */
const REVOKED: { readonly sessionId: SessionId; readonly oidcIdToken: string | null } = { sessionId: REVOKED_SESSION_ID, oidcIdToken: null };
// Distinct fake TCP peers so per-IP throttle buckets don't collide across tests (each test keys its own IP).
const connEnv = (addr: string): { incoming: { socket: { remoteAddress: string; remotePort: number; remoteFamily: string } } } => ({
  incoming: { socket: { remoteAddress: addr, remotePort: 40_000, remoteFamily: "IPv4" } },
});

function sessionsStub(over: Partial<AuthSessionsPort> = {}): AuthSessionsPort {
  return {
    create: (): Promise<{ token: SessionToken; expiresAt: number }> =>
      Promise.resolve({ token: castId<SessionToken>("tok-123"), expiresAt: NOW + THIRTY_DAYS_MS }),
    revokeByToken: (): Promise<typeof REVOKED | null> => Promise.resolve(REVOKED),
    provisionIdentity: (
      _identity: ResolvedIdentity,
    ): Promise<{ outcome: "provisioned"; userId: UserId; enabled: boolean; role: UserRole; identityChanged: boolean } | { outcome: "denied" }> =>
      Promise.resolve({ outcome: "provisioned", userId: castId<UserId>("usr_x"), enabled: true, role: "user", identityChanged: false }),
    revokeByExternalId: (): Promise<RevokedSessionsSummary> => Promise.resolve({ revoked: 0, userIds: [] }),
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
    // W7a — the routes evict live sockets beside every revoke; this suite drives no socket, so the port is
    // inert and the eviction pins live in the unit suite (auth-routes.test.ts), which can observe it.
    sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
    now: (): number => NOW,
    db,
    resolveLoginLimit: (): number => 10,
    authenticate: ownerAuth(castId<UserId>("usr_owner")),
    ...over,
  };
  registerAuthRoutes(app, deps);
  return app;
}

/** POST a form-encoded login body from a given fake peer IP. Carries the `x-orb-csrf` header by default —
 *  the SAME-ORIGIN client always sends it (data/auth-bootstrap.ts), so the behavioral arms model a real
 *  login; the CSRF-gate arms below inline `app.request` to omit it (the cross-origin form-POST shape). */
async function postLogin(app: Hono, ip: string, body: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return await app.request(
    LOGIN,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", [CSRF]: "1", ...extraHeaders },
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

// LOGIN CSRF gate. Login is form-encoded (CORS-simple), so the JSON content-type belt at entry/app.ts never
// reaches it — a cross-site page could auto-POST a `<form>` to log the victim into the ATTACKER's account
// (login-CSRF). The custom `x-orb-csrf` header a cross-site page cannot set without a preflight this app
// never grants is the fix (the same belt logout uses; spine invariant #9). Same-origin client always sends it.
describe("login — CSRF gate (real app)", () => {
  /** The cross-origin form-POST shape: a form-urlencoded body with NO custom header (a `<form>` auto-POST
   *  cannot set one). Bypasses the `postLogin` helper, which injects `x-orb-csrf` like the real client. */
  const postLoginNoCsrf = async (app: Hono, ip: string): Promise<Response> =>
    app.request(
      LOGIN,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ handle: "owner", password: "hunter2pw" }).toString(),
      },
      connEnv(ip),
    );

  test("cross-origin form-POST login WITHOUT the CSRF header → 403, no cookie (blocks login-CSRF)", async () => {
    const app = await appWith();
    const res = await postLoginNoCsrf(app, "10.9.9.1");
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("WITH the CSRF header → 200 + session cookie (the same-origin client sends it)", async () => {
    const app = await appWith();
    const res = await postLogin(app, "10.9.9.2", { handle: "owner", password: "hunter2pw" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain(`${COOKIE}=tok-123`);
  });

  test("the CSRF gate fires BEFORE the per-IP throttle (a CSRF-less flood never burns the victim's bucket)", async () => {
    // 20 CSRF-less POSTs from one IP all 403; a legitimate login from that same IP still succeeds — proof the
    // 403s consumed no throttle points (a >10 burst would otherwise have tripped the 10/min/IP cap).
    const app = await appWith();
    const attacker = "10.9.9.3";
    for (let i = 0; i < 20; i += 1) {
      const res = await postLoginNoCsrf(app, attacker);
      expect(res.status).toBe(403);
    }
    const legit = await postLogin(app, attacker, { handle: "owner", password: "hunter2pw" });
    expect(legit.status).toBe(200);
  });
});

describe("login throttle — 10/min/IP (brute-force + scrypt-flood cap)", () => {
  test("the 11th attempt from one IP → 429 with Retry-After; other IPs are unaffected", async () => {
    const app = await appWith({ authenticate: ownerAuth(null) });
    const attacker = "203.0.113.10";
    // 10 wrong-password attempts are allowed (each 401), the 11th is throttled.
    for (let i = 0; i < 10; i += 1) {
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
      await postLogin(app, ip, { handle: "owner", password: "hunter2pw" });
    }
    const res = await postLogin(app, ip, { handle: "owner", password: "hunter2pw" });
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("login throttle — the HANDLE axis (B1: the distributed brute force the per-IP cap cannot see)", () => {
  // A TIGHT per-IP cap is what makes these arms unambiguous: every attempt below comes from a peer that has
  // spent at most 1 of its 2 points, so an IP-axis 429 is structurally impossible here and any 429 can only
  // be the handle axis. (The 429 body/headers are identical on both axes on purpose — which belt fired is an
  // operator signal, never a hint that tells an attacker whether to rotate IPs or handles.)
  /** A real password check: only `hunter2pw` authenticates, so a burst is genuinely failed logins. */
  const passwordAuth: LocalAuthenticator = (_handle, password: string): Promise<UserId | null> =>
    Promise.resolve(password === "hunter2pw" ? castId<UserId>("usr_owner") : null);

  /** Exhaust one handle's budget from ROTATING peers — the shape a botnet produces and the per-IP cap cannot
   *  see. Sequential: the fixed-window increment is racy under parallel calls. */
  async function burstFromRotatingIps(app: Hono, handle: Handle, octetBase: number): Promise<void> {
    for (let i = 0; i < HANDLE_CAP; i += 1) {
      const res = await postLogin(app, `192.0.2.${octetBase + i}`, { handle, password: "wrong" });
      expect(res.status).toBe(401);
    }
  }

  test("one handle, N fresh IPs → the next attempt is 429 with Retry-After (no IP is anywhere near its cap)", async () => {
    const app = await appWith({ authenticate: passwordAuth, resolveLoginLimit: (): number => IP_CAP });
    await burstFromRotatingIps(app, VICTIM_HANDLE, 10);

    const throttled = await postLogin(app, "192.0.2.100", { handle: VICTIM_HANDLE, password: "wrong" });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("retry-after")).not.toBeNull();
  });

  test("the handle key is the one `authenticate` looks the row up with — padding does not mint a fresh bucket", async () => {
    const app = await appWith({ authenticate: passwordAuth, resolveLoginLimit: (): number => IP_CAP });
    await burstFromRotatingIps(app, VICTIM_HANDLE, 20);

    // `sessions.authenticate` trims before `eq(users.handle, …)`, so the throttle must trim too — otherwise a
    // brute-forcer dodges the whole axis with a space.
    const padded = await postLogin(app, "192.0.2.101", { handle: `  ${VICTIM_HANDLE} `, password: "wrong" });
    expect(padded.status).toBe(429);
  });

  test("the axes are INDEPENDENT — a different handle is untouched mid-throttle, and the IP axis never fired", async () => {
    const app = await appWith({ authenticate: passwordAuth, resolveLoginLimit: (): number => IP_CAP });
    await burstFromRotatingIps(app, VICTIM_HANDLE, 30);
    expect((await postLogin(app, "192.0.2.102", { handle: VICTIM_HANDLE, password: "wrong" })).status).toBe(429);

    // Another account from a fresh peer: the handle axis is per-account, so this proceeds to a normal 401.
    expect((await postLogin(app, "192.0.2.103", { handle: "bystander", password: "wrong" })).status).toBe(401);
    // …and a peer from the burst (1 of its 2 points spent) still proceeds — the IP axis is provably not what
    // fired above, and one account's throttle never spills onto the neighbours behind the same NAT.
    expect((await postLogin(app, "192.0.2.30", { handle: "bystander", password: "wrong" })).status).toBe(401);
  });

  test("the handle throttle fires BEFORE credential verification — a lucky guess can't slip through", async () => {
    const app = await appWith({ authenticate: passwordAuth, resolveLoginLimit: (): number => IP_CAP });
    await burstFromRotatingIps(app, VICTIM_HANDLE, 40);

    const correct = await postLogin(app, "192.0.2.104", { handle: VICTIM_HANDLE, password: "hunter2pw" });
    expect(correct.status).toBe(429);
    expect(correct.headers.get("set-cookie")).toBeNull();
  });

  test("ROLLING WINDOW, never a lockout — the real user is in on the next window with their own password", async () => {
    let clock = NOW;
    const app = await appWith({ authenticate: passwordAuth, resolveLoginLimit: (): number => IP_CAP, now: (): number => clock });
    await burstFromRotatingIps(app, VICTIM_HANDLE, 50);
    expect((await postLogin(app, "192.0.2.105", { handle: VICTIM_HANDLE, password: "hunter2pw" })).status).toBe(429);

    // The whole anti-DoS point: an attacker hammering someone's handle SLOWS them for one window, it never
    // locks the account — no persisted state, the next window is clean.
    clock = NOW + LOGIN_WINDOW_MS;
    const after = await postLogin(app, "192.0.2.106", { handle: VICTIM_HANDLE, password: "hunter2pw" });
    expect(after.status).toBe(200);
    expect(after.headers.get("set-cookie") ?? "").toContain(`${COOKIE}=tok-123`);
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

describe("first-run owner-password setup (B4) — real app + freshDb", () => {
  const firstRunPath = "/api/auth/first-run";

  /** A first-run deps recorder: `originAllowed` is fixed per-test; `setOwnerPassword` records its calls and
   *  returns the configured claim outcome (a UserId = claimed, null = already-set / no owner). */
  function firstRunStub(opts: { originAllowed: boolean; claim: UserId | null }): { deps: FirstRunRouteDeps; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        originAllowed: (): boolean => opts.originAllowed,
        setOwnerPassword: (plain: string): Promise<UserId | null> => {
          calls.push(plain);
          return Promise.resolve(opts.claim);
        },
      },
    };
  }

  async function postFirstRun(app: Hono, ip: string, password: string): Promise<Response> {
    return await app.request(
      firstRunPath,
      {
        method: "POST",
        // The same-origin client sends the CSRF header (data/auth-bootstrap.ts firstRunSetup); the behavioral
        // arms model that. The CSRF-gate arm below inlines a request omitting it (the cross-origin shape).
        headers: { "content-type": "application/x-www-form-urlencoded", [CSRF]: "1" },
        body: new URLSearchParams({ password }).toString(),
      },
      connEnv(ip),
    );
  }

  test("virgin box on a LOCAL origin → 200 + the session cookie (claims the owner password)", async () => {
    const fr = firstRunStub({ originAllowed: true, claim: castId<UserId>("usr_owner") });
    const app = await appWith({ firstRun: fr.deps });
    const res = await postFirstRun(app, "10.0.1.1", "hunter2password");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain(`${COOKIE}=tok-123`);
    expect(fr.calls).toEqual(["hunter2password"]);
  });

  test("ONE-SHOT: once the owner password is set, a second attempt → 409, no cookie (never overwrites)", async () => {
    // `claim: null` models the atomic null-guarded claim finding the password already set.
    const fr = firstRunStub({ originAllowed: true, claim: null });
    const app = await appWith({ firstRun: fr.deps });
    const res = await postFirstRun(app, "10.0.1.2", "hunter2password");
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("a NON-LOCAL origin → 403 BEFORE the claim is attempted (owner-fallback parity)", async () => {
    const fr = firstRunStub({ originAllowed: false, claim: castId<UserId>("usr_owner") });
    const app = await appWith({ firstRun: fr.deps });
    const res = await postFirstRun(app, "203.0.113.50", "hunter2password");
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    // The password-set was never even attempted from an untrusted origin.
    expect(fr.calls).toEqual([]);
  });

  // CSRF gate: the loopback-peer origin gate does NOT stop this class — the owner's OWN browser is a loopback
  // peer, so a cross-origin page the owner visits could drive the unauthenticated owner-password set. The
  // custom header a cross-site page cannot set (without a preflight this app never grants) is the real fix.
  test("a LOCAL origin but NO CSRF header → 403 BEFORE the claim (blocks first-run CSRF from the owner's browser)", async () => {
    const fr = firstRunStub({ originAllowed: true, claim: castId<UserId>("usr_owner") });
    const app = await appWith({ firstRun: fr.deps });
    const res = await app.request(
      firstRunPath,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ password: "hunter2password" }).toString(),
      },
      connEnv("10.0.1.9"),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(fr.calls).toEqual([]); // the password-set was never attempted
  });

  test("a too-short password → 400, no claim attempted", async () => {
    const fr = firstRunStub({ originAllowed: true, claim: castId<UserId>("usr_owner") });
    const app = await appWith({ firstRun: fr.deps });
    const res = await postFirstRun(app, "10.0.1.3", "short");
    expect(res.status).toBe(400);
    expect(fr.calls).toEqual([]);
  });

  test("the route is ABSENT when no firstRun dep is supplied (non-local modes) → 404", async () => {
    const app = await appWith(); // no firstRun
    const res = await postFirstRun(app, "10.0.1.4", "hunter2password");
    expect(res.status).toBe(404);
  });
});

// Rule B through the REAL gate `entry/lifecycle.ts` wires: a same-host tunnel reaches the route on a loopback
// socket, so the socket alone would offer the owner password to the internet. Each test keys its own
// loopback address so the per-IP throttle buckets never collide.
describe("first-run owner-password setup — a relayed loopback request cannot claim (Rule B)", () => {
  const firstRunPath = "/api/auth/first-run";

  function realGate(): { deps: FirstRunRouteDeps; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        originAllowed: (peer: string | undefined, requestHeaders: Headers): boolean => ownerFallbackAllowed(peer, requestHeaders),
        setOwnerPassword: (plain: string): Promise<UserId | null> => {
          calls.push(plain);
          return Promise.resolve(castId<UserId>("usr_owner"));
        },
      },
    };
  }

  async function claimFrom(app: Hono, ip: string, relay: Record<string, string>): Promise<Response> {
    return await app.request(
      firstRunPath,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", [CSRF]: "1", ...relay },
        body: new URLSearchParams({ password: "hunter2password" }).toString(),
      },
      connEnv(ip),
    );
  }

  test.each([
    ["forwarded", "for=203.0.113.9;proto=https", "127.0.0.11"],
    ["x-forwarded-for", "203.0.113.9", "127.0.0.12"],
    ["x-real-ip", "203.0.113.9", "127.0.0.13"],
    ["cf-connecting-ip", "203.0.113.9", "127.0.0.14"],
    ["x-forwarded-proto", "https", "127.0.0.15"],
    ["x-forwarded-host", "chat.example.com", "127.0.0.16"],
  ])("a loopback peer carrying `%s` → 403, no claim, no cookie", async (name, value, ip) => {
    const fr = realGate();
    const app = await appWith({ firstRun: fr.deps });
    const res = await claimFrom(app, ip, { [name]: value });
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(fr.calls).toEqual([]);
  });

  test("control: a bare loopback peer claims once", async () => {
    const fr = realGate();
    const app = await appWith({ firstRun: fr.deps });
    const res = await claimFrom(app, "127.0.0.17", {});
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain(`${COOKIE}=tok-123`);
    expect(fr.calls).toEqual(["hunter2password"]);
  });
});

describe("logout — CSRF gate (real app)", () => {
  test("cross-site force-logout: cookie present but NO CSRF header → 403, no revoke", async () => {
    let revoked: string | null = null;
    const app = await appWith({
      sessions: sessionsStub({
        revokeByToken: (t: string): Promise<typeof REVOKED | null> => {
          revoked = t;
          return Promise.resolve(REVOKED);
        },
      }),
    });
    const res = await app.request("/api/auth/logout", { method: "POST", headers: { cookie: `${COOKIE}=tok-123` } }, connEnv("10.0.0.9"));
    expect(res.status).toBe(403);
    expect(revoked).toBeNull();
  });

  test("with the CSRF header → revokes + clears (200, A6)", async () => {
    let revoked: string | null = null;
    const app = await appWith({
      sessions: sessionsStub({
        revokeByToken: (t: string): Promise<typeof REVOKED | null> => {
          revoked = t;
          return Promise.resolve(REVOKED);
        },
      }),
    });
    const res = await app.request("/api/auth/logout", { method: "POST", headers: { cookie: `${COOKIE}=tok-123`, [CSRF]: "1" } }, connEnv("10.0.0.10"));
    expect(res.status).toBe(200); // A6 — 200 `{endSessionUrl}` (null in local mode), no longer 204
    expect(revoked).toBe("tok-123");
    expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });
});

// ── #2413: the plain-http LAN login round trip, over the REAL route ───────────────────────────────────────
//
// THE BUG, reproduced at the seam it was reported at. Phone → `http://192.168.1.20:8788`, correct password,
// 200 OK — and the user stays signed out, with nothing in any log to say why. The cause is not in this app's
// logic at all: the browser DISCARDS the Set-Cookie, because `Secure` is refused from a non-secure origin and
// the `__Host-` prefix REQUIRES `Secure` (RFC 6265bis §4.1.2.5 / §4.1.3.2). A server-side test cannot run a
// cookie jar, so what is asserted here is the thing the jar decides on: the exact name + attributes leaving
// the route, against a real non-localhost `Host` over plain http, with the spec rule named. The
// env-knob→constant wiring behind it is pinned in tests/server/foundation/env/index.test.ts.
describe("plain-http LAN login (#2413) — the cookie the browser is asked to keep", () => {
  /** The shape the bug report arrives in: a real LAN authority, no TLS, no proxy headers. */
  const lanHost = "192.168.1.20:8788";

  /** Re-register the routes from a FRESH module graph so the module-level cookie posture is resolved from
   *  the stubbed env rather than the runner's. `unstubEnvs` in the root config tears the stub down per test. */
  async function lanLogin(insecure: boolean): Promise<Response> {
    if (insecure) {
      vi.stubEnv("SESSION_COOKIE_INSECURE", "true");
    }
    vi.resetModules();
    const { registerAuthRoutes: register } = await import("@orb/server/entry/http");
    const db = await freshDb();
    const app = new Hono();
    register(app, {
      sessions: sessionsStub(),
      sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
      now: (): number => NOW,
      db,
      resolveLoginLimit: (): number => 10,
      authenticate: ownerAuth(castId<UserId>("usr_owner")),
    });
    return await app.request(
      LOGIN,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", [CSRF]: "1", host: lanHost },
        body: new URLSearchParams({ handle: "owner", password: "hunter2pw" }).toString(),
      },
      connEnv("192.168.1.55"),
    );
  }

  // THE DEFAULT, i.e. the reported bug: the login succeeds and the cookie is one this origin's browser must
  // throw away. Green BEFORE the fix as well — it documents the symptom, it does not prove the fix.
  test("OFF (the default): the mint carries __Host- + Secure, which this origin's browser MUST discard", async () => {
    const res = await lanLogin(false);
    expect(res.status).toBe(200);
    const [minted] = res.headers.getSetCookie();
    expect(minted).toContain("__Host-orb_session=tok-123");
    expect(minted).toContain("Secure");
  });

  // THE FIX, at the same seam: the same request, same non-localhost plain-http origin, now answered with a
  // cookie that has no prefix and no `Secure` — the one a browser on `http://192.168.1.20:8788` keeps.
  test("ON: the mint carries the bare name with NO Secure — the cookie this origin's browser keeps", async () => {
    const res = await lanLogin(true);
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const [minted] = cookies;
    expect(minted).toContain("orb_session_insecure=tok-123");
    expect(minted).not.toContain("Secure");
    expect(minted).not.toContain("__Host-");
    // the belts that are NOT part of the trade survive
    expect(minted).toContain("HttpOnly");
    expect(minted).toContain("SameSite=Lax");
    expect(minted).toContain("Path=/");
    // and the OTHER posture's name is cleared in the same response, so flipping the knob does not leave a
    // live token in an already-signed-in browser
    expect(cookies).toHaveLength(2);
    expect(cookies[1]).toContain("__Host-orb_session=;");
    expect(cookies[1]).toContain("Max-Age=0");
  });

  test("ON: logout clears BOTH names over the same plain-http origin", async () => {
    vi.stubEnv("SESSION_COOKIE_INSECURE", "true");
    vi.resetModules();
    const { registerAuthRoutes: register } = await import("@orb/server/entry/http");
    const db = await freshDb();
    const app = new Hono();
    register(app, {
      sessions: sessionsStub(),
      sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
      now: (): number => NOW,
      db,
      resolveLoginLimit: (): number => 10,
    });
    const res = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: { cookie: "orb_session_insecure=tok-123", [CSRF]: "1", host: lanHost } },
      connEnv("192.168.1.55"),
    );
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.map((c) => c.split("=")[0])).toEqual(["__Host-orb_session", "orb_session_insecure"]);
    for (const cookie of cookies) {
      expect(cookie).toContain("Max-Age=0");
    }
  });
});
