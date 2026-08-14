// THE /api/_debug ADMISSION INVARIANT (AUTHFIX-2) — a cross-cutting property suite over three files no
// single-slice test can see together: `entry/auth/seam.ts::isAdmin` (the verdict), `foundation/
// observability/debug/routes.ts::createDebugAuthMiddleware` (the gate), and the wiring shape `entry/app.ts`
// joins them with (`auth: { expectedToken: env.DEBUG_TOKEN, adminAuth: { isAdmin: deps.seam.isAdmin } }` —
// reproduced here verbatim, with a REAL seam, so this suite fails if either half regresses).
//
// THE INVARIANT (non-negotiable): an UN-CREDENTIALED caller never reaches a /api/_debug route — in EVERY
// AUTH_MODE, from ANY `Host`, with or without a `DEBUG_TOKEN` configured. The two ways in are a credential:
// an admin/owner SESSION (`via:"cookie"` / a signed-JWT `via:"header"`) or the `x-debug-token` operator
// secret. Nothing else.
//
// WHY THIS EXISTS (the defect it pins, live on the owner's box until 2026-08-07): `isAdmin` ran the full
// `resolvePrincipal`, whose owner-FALLBACK arm mints an owner Principal for a caller that presented NOTHING.
// The gate's admin arm consults `isAdmin` BEFORE the token check, so `/api/_debug/*` served with no cookie
// and no token — unconditionally under `single-user`, and under an SSO mode to anyone who could reach the
// port and send `Host: 127.0.0.1` (`ownerFallbackAllowed` → `isLocalOrigin`, which reads the CLIENT-SUPPLIED
// Host header). Behind it sit principal-blind whole-db reads (`/db/chats`, `/config/user`, and — with
// WIRE_CAPTURE=on — provider request BODIES at `/wire/captures`).
//
// The routes behind the gate are DELIBERATELY un-scoped host reads (`@owner-scope-ok`, D20): the gate is
// their entire boundary, and this suite is that assumption's ENFORCER. A prose-only boundary is a wish
// (constitution §2.3).
//
// EVERY DENY ASSERTS THE BODY, not just "not 200": a bare status check cannot tell the gate's own 404
// ("debug API disabled") apart from a route that was never registered, and a leaked request that reached a
// handler and threw would read as a non-200 too.

import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { ownerHandles } from "@orb/server/domain/sessions";
import { createAuthSeam } from "@orb/server/entry/auth";
import { registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import type { AuthConfig, ForwardJwtVerifier } from "@orb/server/infra/auth";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

const OPERATOR_TOKEN = "debug-token-for-this-suite";
const OWNER_HANDLE = "owner";

/** The gate's two refusal shapes. Asserted by BODY so a deny is never confused with an unregistered route. */
const DISABLED_BODY = { error: "debug API disabled — set DEBUG_TOKEN to enable" };
const UNAUTHORIZED_BODY = { error: "unauthorized" };

/** The routes an un-credentialed caller must not reach. `/db/chats` and `/config/user` are the
 *  principal-blind whole-db reads the finding is actually about; `/info` is the un-gated-by-db control. */
const PROBE_PATHS = ["/api/_debug/info", "/api/_debug/db/chats", "/api/_debug/config/user"] as const;

function baseConfig(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: OWNER_HANDLE,
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...overrides,
  };
}

/** A SessionsService whose unused verbs throw — a throw proves a path reached a verb it should not have. */
function stubSessions(overrides: Partial<SessionsService>): SessionsService {
  const unused = (name: string) => (): never => {
    throw new Error(`unexpected sessions.${name}`);
  };
  return {
    create: unused("create"),
    validate: unused("validate") as SessionsService["validate"],
    revokeByToken: unused("revokeByToken"),
    revoke: unused("revoke"),
    revokeAllForUser: unused("revokeAllForUser"),
    revokeByExternalId: unused("revokeByExternalId"),
    listForUser: unused("listForUser"),
    ensureUser: unused("ensureUser") as SessionsService["ensureUser"],
    provisionIdentity: unused("provisionIdentity") as SessionsService["provisionIdentity"],
    loadUserById: unused("loadUserById") as SessionsService["loadUserById"],
    resolveHandle: unused("resolveHandle") as SessionsService["resolveHandle"],
    authenticate: unused("authenticate") as SessionsService["authenticate"],
    linkExternalId: unused("linkExternalId") as SessionsService["linkExternalId"],
    ownerNeedsPassword: unused("ownerNeedsPassword") as SessionsService["ownerNeedsPassword"],
    claimOwnerPassword: unused("claimOwnerPassword") as SessionsService["claimOwnerPassword"],
    ...overrides,
  };
}

/** The users table the FALLBACK arm drives: `ensureUser` derives the role the real verb does (owner iff the
 *  handle is configured), `loadUserById` reads it back. The default `OWNER_HANDLES` is `["owner"]`, so the
 *  un-credentialed fallback lands on a genuine `role:"owner"` row — i.e. this fake is the WORST case, not a
 *  softened one: the principal reaching `isAdmin` really does satisfy `can(p,'admin',global)`. */
function ownerRowSessions(): SessionsService {
  const rows = new Map<string, { id: UserId; role: UserRole; handle: Handle }>();
  return stubSessions({
    ensureUser: (handle: Handle) => {
      const existing = rows.get(handle);
      if (existing !== undefined) {
        return Promise.resolve(existing.id);
      }
      const row = { id: castId<UserId>(`u_${handle}`), role: ownerHandles().includes(handle) ? ("owner" as UserRole) : ("user" as UserRole), handle };
      rows.set(handle, row);
      return Promise.resolve(row.id);
    },
    loadUserById: (userId: UserId) => {
      const row = [...rows.values()].find((r) => r.id === userId);
      // `enabled: true` is the ENABLED row — D135 clause G gates the fallback arm on it, so a double that
      // omitted it would be asserting the gate against a shape the resolver can no longer return.
      return Promise.resolve(row === undefined ? null : { role: row.role, handle: row.handle, externalId: null, enabled: true });
    },
  });
}

/** A cookie-mode users table: `validate` resolves the given role for any token (the cookie CREDENTIAL path). */
function cookieSessions(role: UserRole): SessionsService {
  return stubSessions({
    validate: () =>
      Promise.resolve({
        sessionId: castId<SessionId>("sess_cookie"),
        userId: castId<UserId>("u_cookie"),
        role,
        handle: castId<Handle>("carol"),
        externalId: null,
        enabled: true,
      }),
  });
}

/** A forward-header users table: `provisionIdentity` admits the SSO identity at the given role. */
function forwardSessions(role: UserRole): SessionsService {
  return stubSessions({
    provisionIdentity: () => Promise.resolve({ outcome: "provisioned" as const, userId: castId<UserId>("u_sso"), role, enabled: true }),
  });
}

/** A JWKS verifier that accepts any JWT as the named admin — the SIGNED forward-header path (the one arm
 *  that yields `via:"header"` without a TCP peer, since `isAdmin(headers)` passes no peerIp). */
const acceptingJwtVerifier: ForwardJwtVerifier = {
  verify: () => Promise.resolve({ handle: castId<Handle>("sso-admin"), externalId: castId<ExternalId>("ext-1"), groups: [], email: null }),
};

interface GateApp {
  readonly fetch: (req: Request) => Response | Promise<Response>;
}

/**
 * Build the REAL debug surface over a REAL seam, in the exact shape `entry/app.ts` wires. `db` is a stub the
 * handlers would throw on: a request that gets past the gate to a /db or /config handler blows up loudly
 * rather than quietly returning an empty page, so "the gate held" can never be confused with "the read was
 * empty".
 */
function gateApp(opts: { config: AuthConfig; sessions: SessionsService; expectedToken?: string; verifyForwardJwt?: ForwardJwtVerifier }): GateApp {
  const seam = createAuthSeam({
    config: opts.config,
    sessions: opts.sessions,
    ...(opts.verifyForwardJwt !== undefined ? { verifyForwardJwt: opts.verifyForwardJwt } : {}),
  });
  const app = new Hono();
  registerDebugRoutes(app, {
    // The db must be PRESENT so `/db/*` + `/config/*` actually REGISTER — an unregistered route 404s, which
    // would forge a passing gate — but UNUSABLE, so a request that reaches a handler throws instead of
    // quietly returning an empty page. A typed factory would defeat the point: this must not answer a query.
    // FABRICATION-OK: a deliberately unusable db is the assertion — see above.
    db: {} as unknown as Db,
    auth: { expectedToken: opts.expectedToken, adminAuth: { isAdmin: seam.isAdmin } },
  });
  return app;
}

function get(app: GateApp, path: string, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`http://host-does-not-matter${path}`, { headers })));
}

interface Outcome {
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
}

/** Drive every probe path and report status+body per path — asserted as ONE object so a failure names which
 *  route leaked rather than stopping at the first. */
function outcomes(app: GateApp, headers: Record<string, string>): Promise<Outcome[]> {
  return Promise.all(
    PROBE_PATHS.map(async (path): Promise<Outcome> => {
      const res = await get(app, path, headers);
      return { path, status: res.status, body: await res.json() };
    }),
  );
}

/** The expected REFUSAL for every probe path, by status AND body (see the file header on why body matters). */
function allRefused(tokenConfigured: boolean): Outcome[] {
  return PROBE_PATHS.map((path) => ({
    path,
    status: tokenConfigured ? UNAUTHORIZED : NOT_FOUND,
    body: tokenConfigured ? UNAUTHORIZED_BODY : DISABLED_BODY,
  }));
}

// The four AUTH_MODEs × the Host values that decide `ownerFallbackAllowed`. `localhost` and the RFC1918/
// loopback literals are the ones an attacker supplies verbatim; the FQDN is the only Host that closed the
// fallback before this fix, and it is included to prove the new deny is not merely the old origin gate.
const HOST_CASES = [
  { name: "no Host header at all", headers: {} },
  { name: "Host: localhost", headers: { host: "localhost" } },
  { name: "Host: 127.0.0.1 (the exploit's forged loopback)", headers: { host: "127.0.0.1" } },
  { name: "Host: 10.0.0.7 (a forged private literal)", headers: { host: "10.0.0.7" } },
  { name: "Host: chat.example.com (a public FQDN)", headers: { host: "chat.example.com" } },
] as const;

const MODE_CASES = [
  { mode: "single-user" as const, sessions: ownerRowSessions },
  { mode: "local" as const, sessions: ownerRowSessions },
  { mode: "oidc" as const, sessions: ownerRowSessions },
  { mode: "forward-header" as const, sessions: ownerRowSessions },
];

describe("un-credentialed callers never reach /api/_debug", () => {
  for (const { mode, sessions } of MODE_CASES) {
    for (const { name, headers } of HOST_CASES) {
      test(`${mode}: NO token configured, ${name} → 404 (surface off), never a handler`, async () => {
        const app = gateApp({ config: baseConfig({ mode }), sessions: sessions() });
        expect(await outcomes(app, headers)).toEqual(allRefused(false));
      });

      test(`${mode}: token configured, ${name}, no token sent → 401, never a handler`, async () => {
        const app = gateApp({ config: baseConfig({ mode }), sessions: sessions(), expectedToken: OPERATOR_TOKEN });
        expect(await outcomes(app, headers)).toEqual(allRefused(true));
      });

      test(`${mode}: token configured, ${name}, WRONG token sent → 401`, async () => {
        const app = gateApp({ config: baseConfig({ mode }), sessions: sessions(), expectedToken: OPERATOR_TOKEN });
        expect(await outcomes(app, { ...headers, "x-debug-token": "not-the-token" })).toEqual(allRefused(true));
      });
    }
  }

  // `trustedLocalHosts` widens the ORIGIN gate, which is a fallback concern — it must not widen the DEBUG
  // gate. Without this row a deployment that trusts its own hostname would silently re-open the hole.
  test("a configured trustedLocalHost does not re-open the debug gate", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "oidc", trustedLocalHosts: ["chat.example.com"] }),
      sessions: ownerRowSessions(),
      expectedToken: OPERATOR_TOKEN,
    });
    expect(await outcomes(app, { host: "chat.example.com" })).toEqual(allRefused(true));
  });

  // AUTH_FALLBACK=deny already yields no principal at all — pinned so the deny is proven to come from the
  // credential rule and not only from the fallback being configured off.
  test("single-user with fallback=deny is refused too (the deny is the credential rule, not the config)", async () => {
    const app = gateApp({ config: baseConfig({ mode: "single-user", fallback: "deny" }), sessions: stubSessions({}), expectedToken: OPERATOR_TOKEN });
    expect(await outcomes(app, { host: "127.0.0.1" })).toEqual(allRefused(true));
  });
});

// POSITIVE CONTROLS — without these the suite above could pass because the instrument is broken (a route
// that never registered, a seam that always throws) rather than because the gate holds.
describe("the two real credentials still open the gate", () => {
  test("the operator's x-debug-token authorizes (the headless credential is untouched)", async () => {
    const app = gateApp({ config: baseConfig({ mode: "single-user" }), sessions: ownerRowSessions(), expectedToken: OPERATOR_TOKEN });
    const res = await get(app, "/api/_debug/info", { "x-debug-token": OPERATOR_TOKEN });
    expect(res.status).toBe(OK);
  });

  test("an ADMIN session cookie authorizes with no token configured (the arm's documented purpose)", async () => {
    const app = gateApp({ config: baseConfig({ mode: "local" }), sessions: cookieSessions("admin") });
    const res = await get(app, "/api/_debug/info", { cookie: "__Host-orb_session=t" });
    expect(res.status).toBe(OK);
  });

  test("an OWNER session cookie authorizes", async () => {
    const app = gateApp({ config: baseConfig({ mode: "oidc" }), sessions: cookieSessions("owner") });
    const res = await get(app, "/api/_debug/info", { cookie: "__Host-orb_session=t" });
    expect(res.status).toBe(OK);
  });

  test("a signed forward-header SSO admin authorizes (via:'header' is a credential)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "forward-header", verifyForwardJwt: true, jwksAllowlist: ["idp.example.test"] }),
      sessions: forwardSessions("admin"),
      verifyForwardJwt: acceptingJwtVerifier,
    });
    const res = await get(app, "/api/_debug/info", { "x-authentik-jwt": "jwt", "x-authentik-meta-jwks": "{}" });
    expect(res.status).toBe(OK);
  });

  test("a plain USER session cookie is still refused (the role gate is unchanged)", async () => {
    const app = gateApp({ config: baseConfig({ mode: "local" }), sessions: cookieSessions("user"), expectedToken: OPERATOR_TOKEN });
    expect(await outcomes(app, { cookie: "__Host-orb_session=t" })).toEqual(allRefused(true));
  });
});
