// Integration: the login route's BEHAVIORAL belts over a REAL Hono app + a freshDb — the per-IP login
// throttle (DB-backed `rate_limit_buckets`, replica-correct), the 4 KiB body cap, and the mint/verify
// paths. These need a live limiter (db) + a real conninfo env for `clientIp`, so they run here rather than
// on the pure mock harness in auth-routes.test.ts. Determinism: the throttle window is pinned via `now`.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { auditLogs, chatInvites, chatParticipants, rateLimitBuckets, users } from "@orb/db";
import type { ChatId, ChatInviteId, ChatParticipantId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RevokedSessionsSummary } from "@orb/server/domain/sessions";
import { isReservedSignupHandle } from "@orb/server/domain/sessions";
import type { AuthRoutesDeps, AuthSessionsPort, FirstRunRouteDeps, LocalAuthenticator, SignupRouteDeps } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import { logger } from "@orb/server/foundation/observability";
import { createPublicHttpMintNotice, ownerFallbackAllowed } from "@orb/server/infra/auth";
import { eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, describe, vi } from "vitest";
import { createSignupInvite } from "../../../../packages/server/src/domain/chat/verbs/signup-invite.ts";
import { createSessionsService } from "../../../../packages/server/src/domain/sessions/service.ts";
import { createHostPrincipalResolver } from "../../../../packages/server/src/entry/auth/seam.ts";
import { createSignupMinterCheck } from "../../../../packages/server/src/entry/compose/chat.ts";
import { env } from "../../../../packages/server/src/foundation/env/index.ts";
import { buildAuditStatementIfPrecedingWrote } from "../../../../packages/server/src/foundation/observability/audit.ts";
import { freshDb } from "../../../support/db.ts";
import { seedChat, seedUser } from "../../../support/factories/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const THIRTY_DAYS_MS = 2_592_000_000;
// These arms drive plain http from a LAN peer (no proxy), so the mint is the http transport's cookie; the
// transport describe below pins both names.
const COOKIE = "orb_session_insecure";
const SECURE_COOKIE = "__Host-orb_session";
const CSRF = "x-orb-csrf";
/** What a trusted proxy in front of a TLS listener adds to every request. */
const PROXY_HTTPS = { "x-forwarded-proto": "https" } as const;
const PUBLIC_HTTP_EVENT = "session_minted_over_public_http";
const HOUR_MS = 3_600_000;
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
  test("valid credentials → 200 + the session cookie", async () => {
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
  // D254 — one IPv6 host holds a whole /64; a per-address key must not reset when it rotates inside it.
  test("two IPv6 addresses in one /64 share the per-address login bucket; another /64 does not", async () => {
    const app = await appWith({ resolveLoginLimit: (): number => 1 });
    expect((await postLogin(app, "2001:db8:cc:1::1", { handle: "owner", password: "hunter2pw" })).status).toBe(200);
    expect((await postLogin(app, "2001:db8:cc:1::2", { handle: "owner", password: "hunter2pw" })).status).toBe(429);
    expect((await postLogin(app, "2001:db8:cc:2::1", { handle: "owner", password: "hunter2pw" })).status).toBe(200);
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

// Behind a same-host appending proxy the peer is loopback and the visitor controls the LEFT end of
// X-Forwarded-For. The throttle keys on the address the proxy appended, so rotating the left end buys nothing.
describe("login throttle — a spoofed leftmost X-Forwarded-For cannot reset the per-IP bucket", () => {
  test("ten attempts each claiming a fresh leftmost address → the 11th is 429", async () => {
    const app = await appWith({ authenticate: ownerAuth(null) });
    const relayed = (i: number): Record<string, string> => ({ "x-forwarded-for": `10.66.${String(i)}.1, 198.51.100.7` });
    for (let i = 0; i < 10; i += 1) {
      const res = await postLogin(app, "127.0.0.1", { handle: "owner", password: "wrong" }, relayed(i));
      expect(res.status).toBe(401);
    }
    const throttled = await postLogin(app, "127.0.0.1", { handle: "owner", password: "wrong" }, relayed(10));
    expect(throttled.status).toBe(429);
    // Control: a different visitor behind the same proxy has its own bucket.
    const other = await postLogin(app, "127.0.0.1", { handle: "owner", password: "wrong" }, { "x-forwarded-for": "198.51.100.8" });
    expect(other.status).toBe(401);
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

// ── Rule C: the session cookie follows the request's transport, over the REAL route ──────────────────────
//
// A browser drops a `Secure` cookie set over plain http on any origin but localhost, and the `__Host-` prefix
// requires `Secure`. So a plain-http request is minted the prefix-less `orb_session_insecure` without
// `Secure` (the cookie a phone at http://192.168.1.20:8788 keeps), and only a request a trusted proxy marks
// `X-Forwarded-Proto: https` is minted `__Host-orb_session`. Each mint clears the other name.
describe("Rule C — the minted cookie follows the request's transport", () => {
  const creds = { handle: "owner", password: "hunter2pw" };

  test("plain http from a LAN peer → the insecure name without Secure, and the __Host- name cleared", async () => {
    const app = await appWith();
    const res = await postLogin(app, "192.168.1.55", creds);
    expect(res.status).toBe(200);
    const [minted, cleared] = res.headers.getSetCookie();
    expect(minted).toContain(`${COOKIE}=tok-123`);
    expect(minted).not.toContain("Secure");
    for (const attr of ["HttpOnly", "SameSite=Lax", "Path=/"]) {
      expect(minted).toContain(attr);
    }
    expect(cleared).toContain(`${SECURE_COOKIE}=;`);
    expect(cleared).toContain("Max-Age=0");
  });

  test("https asserted by a trusted proxy peer → the __Host- name with Secure, and the insecure name cleared", async () => {
    const app = await appWith();
    const res = await postLogin(app, "172.18.0.5", creds, PROXY_HTTPS);
    expect(res.status).toBe(200);
    const [minted, cleared] = res.headers.getSetCookie();
    expect(minted).toContain(`${SECURE_COOKIE}=tok-123`);
    expect(minted).toContain("Secure");
    expect(cleared).toContain(`${COOKIE}=;`);
  });

  test("a PUBLIC peer forging X-Forwarded-Proto: https is still minted the http cookie", async () => {
    const app = await appWith();
    const res = await postLogin(app, "203.0.113.9", creds, PROXY_HTTPS);
    expect(res.headers.getSetCookie()[0]).toContain(`${COOKIE}=tok-123`);
  });

  test("logout reads only this transport's cookie, and clears both names", async () => {
    const revoked: string[] = [];
    const app = await appWith({
      sessions: sessionsStub({
        revokeByToken: (t: string): Promise<typeof REVOKED | null> => {
          revoked.push(t);
          return Promise.resolve(REVOKED);
        },
      }),
    });
    const both = `${COOKIE}=tok-http; ${SECURE_COOKIE}=tok-https`;
    const overHttp = await app.request("/api/auth/logout", { method: "POST", headers: { cookie: both, [CSRF]: "1" } }, connEnv("192.168.1.56"));
    const overHttps = await app.request("/api/auth/logout", { method: "POST", headers: { cookie: both, [CSRF]: "1", ...PROXY_HTTPS } }, connEnv("172.18.0.6"));
    expect(revoked).toEqual(["tok-http", "tok-https"]);
    for (const res of [overHttp, overHttps]) {
      expect(res.headers.getSetCookie().map((c) => c.split("=")[0])).toEqual([SECURE_COOKIE, COOKIE]);
    }
  });
});

// ── Rule E: a session minted over plain http from the public internet is a security line ─────────────────
//
// The owner ruled warn, not refuse. The line is keyed by the resolved client address (XFF-aware) and throttled
// to one per address per hour, so a port-forwarded box logs each visitor once instead of every sign-in.
describe("Rule E — a plain-http mint from a public client logs once per client per hour", () => {
  const creds = { handle: "owner", password: "hunter2pw" };

  function harness(): { app: Promise<Hono>; advance: (ms: number) => void; logged: () => unknown[] } {
    let at = NOW;
    const spy = vi.spyOn(logger, "warn");
    return {
      app: appWith({ publicHttpMintNotice: createPublicHttpMintNotice(() => at) }),
      advance: (ms): void => {
        at += ms;
      },
      logged: (): unknown[] =>
        spy.mock.calls.flatMap(([bindings]) => {
          const fields = bindings as Record<string, unknown>;
          return fields["event"] === PUBLIC_HTTP_EVENT ? [fields["clientIp"]] : [];
        }),
    };
  }

  test("a router port-forward (public peer, plain http) logs one line per client per hour", async () => {
    const h = harness();
    const app = await h.app;
    expect((await postLogin(app, "203.0.113.9", creds)).status).toBe(200);
    await postLogin(app, "203.0.113.9", creds);
    await postLogin(app, "198.51.100.4", creds);
    expect(h.logged()).toEqual(["203.0.113.9", "198.51.100.4"]);
    h.advance(HOUR_MS);
    await postLogin(app, "203.0.113.9", creds);
    expect(h.logged()).toEqual(["203.0.113.9", "198.51.100.4", "203.0.113.9"]);
  });

  test("a public client behind a same-host proxy without TLS is keyed by its forwarded address", async () => {
    const h = harness();
    await postLogin(await h.app, "127.0.0.1", creds, { "x-forwarded-for": "203.0.113.20" });
    expect(h.logged()).toEqual(["203.0.113.20"]);
  });

  // Controls: the two shapes the rule leaves silent.
  test("a LAN client over plain http and a public client over proxied https log nothing", async () => {
    const h = harness();
    const app = await h.app;
    await postLogin(app, "192.168.1.57", creds);
    await postLogin(app, "172.18.0.5", creds, { "x-forwarded-for": "203.0.113.21", "x-forwarded-proto": "https" });
    expect(h.logged()).toEqual([]);
  });
});

// ── D254: the local signup-through-invite route ──────────────────────────────────────────────────────────────
// The control order is ruled: CSRF, body cap, multi-human 404, per-address bucket, live-session refusal, strict
// schema, invite pre-check, per-invite bucket, reserved/taken handles, scrypt, the batch, then the cookie.
describe("local signup route (D254)", () => {
  const Signup = "/api/auth/signup";
  const Good = "tok_good";
  const InviteId = castId<ChatInviteId>("chat_invite_signup_route");
  const creds = { token: Good, handle: "friend", password: "hunter2pw" };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  interface Spies {
    hashed: number;
    admitted: number;
    redeemed: number;
    seeded: UserId[];
    announced: ChatId[];
  }

  /** Stub chat ops: `tok_good` names a live invite, anything else names nothing; a redeem refuses as taken. */
  function stubInvites(spies: Spies): SignupRouteDeps["invites"] {
    return {
      admits: (token) => {
        spies.admitted += 1;
        return Promise.resolve(token === Good ? InviteId : null);
      },
      redeem: () => {
        spies.redeemed += 1;
        return Promise.resolve({ outcome: "refused", reason: "handle-taken" });
      },
      announceJoined: (chatId) => {
        spies.announced.push(chatId);
        return Promise.resolve();
      },
    };
  }

  async function signupApp(
    over: { readonly signup?: Partial<SignupRouteDeps>; readonly limit?: number; readonly sessions?: Partial<AuthSessionsPort>; readonly db?: Db } = {},
  ): Promise<{ app: Hono; db: Db; spies: Spies }> {
    const db = over.db ?? (await freshDb());
    const spies: Spies = { hashed: 0, admitted: 0, redeemed: 0, seeded: [], announced: [] };
    const app = new Hono();
    registerAuthRoutes(app, {
      sessions: sessionsStub(over.sessions),
      sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
      now: (): number => NOW,
      db,
      resolveLoginLimit: (): number => over.limit ?? 10,
      signup: {
        multiHumanCapable: (): boolean => true,
        sessionIsLive: (): Promise<boolean> => Promise.resolve(false),
        invites: stubInvites(spies),
        isReservedHandle: isReservedSignupHandle,
        handleTaken: (): Promise<boolean> => Promise.resolve(false),
        hashPassword: (plain: string): Promise<string> => {
          spies.hashed += 1;
          return Promise.resolve(`scrypt$${plain.length}`);
        },
        seedUserConnections: (userId: UserId): Promise<void> => {
          spies.seeded.push(userId);
          return Promise.resolve();
        },
        ...over.signup,
      },
    });
    return { app, db, spies };
  }

  async function postSignup(app: Hono, ip: string, body: unknown, headers: Record<string, string> = { [CSRF]: "1" }): Promise<Response> {
    return await app.request(Signup, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, connEnv(ip));
  }

  async function inviteBuckets(db: Db): Promise<number> {
    return (await db.select().from(rateLimitBuckets).where(like(rateLimitBuckets.key, "signup-invite:%"))).length;
  }

  test("without x-orb-csrf → 403 before the body is read; a deployment that is not multi-human → 404", async () => {
    const { app, spies } = await signupApp();
    expect((await postSignup(app, "10.9.0.1", creds, {})).status).toBe(403);
    expect(spies.admitted).toBe(0);
    const closed = await signupApp({ signup: { multiHumanCapable: (): boolean => false } });
    expect((await postSignup(closed.app, "10.9.0.2", creds)).status).toBe(404);
    expect(closed.spies.admitted).toBe(0);
  });

  test("an invalid or spent token → 404 with no password hashing and no per-invite bucket", async () => {
    const { app, db, spies } = await signupApp();
    const res = await postSignup(app, "10.9.0.3", { ...creds, token: "tok_spent" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "invite_unavailable" });
    expect(spies.hashed).toBe(0);
    expect(await inviteBuckets(db)).toBe(0);
  });

  test("a request that already carries a live session → 409 and no invite work", async () => {
    const { app, spies } = await signupApp({ signup: { sessionIsLive: (): Promise<boolean> => Promise.resolve(true) } });
    const res = await postSignup(app, "10.9.0.4", creds, { [CSRF]: "1", cookie: `${COOKIE}=tok-live` });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_signed_in" });
    expect(spies.admitted).toBe(0);
  });

  test("an unknown key or a short password is refused before the invite pre-check", async () => {
    const { app, spies } = await signupApp();
    expect((await postSignup(app, "10.9.0.5", { ...creds, role: "admin" })).status).toBe(400);
    const weak = await postSignup(app, "10.9.0.6", { ...creds, password: "short" });
    expect(await weak.json()).toEqual({ error: "weak_password" });
    expect(spies.admitted).toBe(0);
  });

  test("two addresses in one IPv6 /64 share the per-address bucket", async () => {
    const { app } = await signupApp({ limit: 1 });
    expect((await postSignup(app, "2001:db8:aa:1::1", { ...creds, token: "tok_spent" })).status).toBe(404);
    expect((await postSignup(app, "2001:db8:aa:1::2", { ...creds, token: "tok_spent" })).status).toBe(429);
    // Control: another /64 has its own bucket.
    expect((await postSignup(app, "2001:db8:aa:2::1", { ...creds, token: "tok_spent" })).status).toBe(404);
  });

  test("N+1 attempts on one invite from distinct /64s → 429 on the per-invite axis", async () => {
    const cap = 2;
    const { app } = await signupApp({ limit: cap });
    const statuses: number[] = [];
    for (const ip of ["2001:db8:b:1::1", "2001:db8:b:2::1", "2001:db8:b:3::1"]) {
      statuses.push((await postSignup(app, ip, creds)).status);
    }
    expect(statuses).toEqual([409, 409, 429]);
  });

  test.each([["owner"], ["Owner"], ["OWNER"], ["Boss"], ["0WNER"], ["B0SS"]])("the reserved handle %s → 409 before any hashing", async (handle) => {
    vi.stubEnv("OWNER_HANDLES", "boss");
    const { app, spies } = await signupApp();
    const res = await postSignup(app, "10.9.1.1", { ...creds, handle });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "handle_unavailable" });
    expect(spies.hashed).toBe(0);
  });

  test("the single-user placeholder handle and a padded owner handle are refused", async () => {
    const { app, spies } = await signupApp();
    expect((await postSignup(app, "10.9.1.2", { ...creds, handle: env.DEFAULT_USER_HANDLE.toUpperCase() })).status).toBe(409);
    expect((await postSignup(app, "10.9.1.3", { ...creds, handle: " owner" })).status).toBe(400);
    expect(spies.hashed).toBe(0);
  });

  // Control: the real chain behind the route. The cookie is minted only after the batch committed.
  test("a normal handle creates one account, one seat and one audit row, then the cookie, the seed and the announcement", async () => {
    const db = await freshDb();
    const room = await seedChat(db, { withHost: true });
    const minter = room.hostUserId;
    if (minter === undefined) {
      throw new Error("seedChat withHost returned no host");
    }
    await db.update(users).set({ role: "admin" }).where(eq(users.id, minter));
    await db.insert(chatInvites).values({
      id: InviteId,
      chatId: room.id,
      tokenHash: `h:${Good}`,
      maxUses: 2,
      expiresAt: NOW + HOUR_MS,
      allowSignup: true,
      createdByUserId: minter,
      mintMode: "local",
      createdAt: NOW,
    });
    await seedUser(db, { handle: castId<Handle>("someone-else") });
    const sessionsSvc = createSessionsService({ db, now: () => NOW, sessionSecret: "s".repeat(32), seedUserConnections: () => Promise.resolve() });
    const announced: ChatId[] = [];
    const invites = createSignupInvite(
      {
        db,
        now: () => NOW,
        hashToken: (token) => `h:${token}`,
        newParticipantId: () => castId<ChatParticipantId>("chat_participant_signup_route"),
        signupInvites: { mode: "local", mintable: true },
      },
      {
        signupUserStatement: sessionsSvc.signupUserStatement,
        minterMayMintSignup: createSignupMinterCheck(sessionsSvc, createHostPrincipalResolver(sessionsSvc)),
        auditStatementAfterWrite: (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at),
        // The local route never previews; any reach fails loudly.
        assemblePreview: () => Promise.reject(new Error("assemblePreview not reached by the local route")),
        emit: (event) => {
          announced.push(event.chatId);
          return Promise.resolve();
        },
      },
    );
    let accountAtMint: number | null = null;
    const { app, spies } = await signupApp({
      db,
      signup: { invites, handleTaken: (handle) => sessionsSvc.signupHandleTaken(handle) },
      sessions: {
        create: async () => {
          accountAtMint = (
            await db
              .select()
              .from(users)
              .where(eq(users.handle, castId<Handle>("friend")))
          ).length;
          return { token: castId<SessionToken>("tok-123"), expiresAt: NOW + THIRTY_DAYS_MS };
        },
      },
    });

    const res = await postSignup(app, "10.9.2.1", creds);

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain(`${COOKIE}=tok-123`);
    expect(accountAtMint).toBe(1);
    const created = await db
      .select()
      .from(users)
      .where(eq(users.handle, castId<Handle>("friend")));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ role: "user", enabled: true, kind: "human", passwordHash: "scrypt$9" });
    const newUserId = created[0]?.id;
    expect(
      await db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.userId, castId<UserId>(newUserId ?? ""))),
    ).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "invites.signup"))).toHaveLength(1);
    expect(spies.seeded).toEqual([newUserId]);
    expect(announced).toEqual([room.id]);
    // The same handle again, any case, is taken now.
    expect((await postSignup(app, "10.9.2.2", { ...creds, handle: "FRIEND" })).status).toBe(409);
  });
});
