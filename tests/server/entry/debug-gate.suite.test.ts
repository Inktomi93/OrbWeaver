// THE /api/_debug ADMISSION INVARIANT (AUTHFIX-2, amended #1193) — a cross-cutting property suite over three
// files no single-slice test can see together: `entry/auth/seam.ts::debugGateAdmits` (the verdict),
// `foundation/observability/debug/routes.ts::createDebugAuthMiddleware` (the gate), and the wiring shape
// `entry/app.ts` joins them with — the ONE-principal-per-request middleware plus
// `adminAuth: { isAdmin: (c) => seam.debugGateAdmits(c.get("principal"), headers) }`, reproduced here with a
// REAL seam so this suite fails if any half regresses.
//
// THE INVARIANT (non-negotiable): a caller who presented NO CREDENTIAL THIS DEPLOYMENT ACCEPTS never reaches
// a /api/_debug route — in EVERY AUTH_MODE, from ANY `Host`, from any NON-LOOPBACK peer, with or without a
// `DEBUG_TOKEN` configured. The ways in are exactly three, and the third is posture-scoped:
//   1. an admin/owner SESSION COOKIE (`via:"cookie"`),
//   2. a SIGNED-JWT SSO identity (`via:"header"`; a proxy-asserted raw `Remote-User:` is NOT one),
//   3. the box operator's LOOPBACK owner fallback (`via:"fallback"`) — ONLY where
//      `foundation/env::resolveOwnerFallbackCredential` says that arm is this box's operator credential
//      (a NON-PRODUCTION box), never in production, where a same-host proxy makes every external request a
//      loopback peer — `single-user` and break-glass included,
// or the `x-debug-token` operator secret. Nothing else.
//
// WHY THIS EXISTS (the defect it pins, live until 2026-08-07): the verdict ran the full `resolvePrincipal`,
// whose owner-FALLBACK arm mints an owner Principal for a caller that presented NOTHING, and the admin arm
// runs BEFORE the token check — so `/api/_debug/*` served with no cookie and no token to anyone who could
// reach the port and send `Host: 127.0.0.1` (the pre-2026-08-19 `ownerFallbackAllowed` read the
// CLIENT-SUPPLIED Host). Behind it sit principal-blind whole-db reads (`/db/chats`, `/config/user`, and —
// with WIRE_CAPTURE=on — provider request BODIES at `/wire/captures`).
//
// WHY ARM 3 EXISTS (#1193, the other failure mode): AUTHFIX-2's fix, plus #298 f2's re-basing of the arm on
// the raw LOOPBACK TCP PEER, left the door shut against the only human on a DEV box — the
// operator, whose loopback session IS how they authenticate everywhere else in the app. The dev bug-report
// button 401'd for the owner's own session. The peer gate is what makes arm 3 safe (a LAN caller never mints
// `via:"fallback"` at all), and the POSTURE is what keeps it out of the deployment where "loopback peer"
// means "the internet". Both are driven below.
//
// The routes behind the gate are DELIBERATELY un-scoped host reads (`@owner-scope-ok`, D20): the gate is
// their entire boundary, and this suite is that assumption's ENFORCER. A prose-only boundary is a wish
// (constitution §2.3).
//
// EVERY DENY ASSERTS THE BODY, not just "not 200": a bare status check cannot tell the gate's own 404
// ("debug API disabled") apart from a route that was never registered, and a leaked request that reached a
// handler and threw would read as a non-200 too. The body also carries the ARM-NAMING `reason` (#1193) —
// asserted, because a refusal the owner cannot act on is what made this bug take a live drive to find.

import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { ownerHandles } from "@orb/server/domain/sessions";
import { createAuthSeam } from "@orb/server/entry/auth";
import type { PrincipalEnv } from "@orb/server/entry/http";
import { registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import type { AuthConfig, ForwardJwtVerifier } from "@orb/server/infra/auth";
import type { Context } from "hono";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

const OPERATOR_TOKEN = "debug-token-for-this-suite";
const OWNER_HANDLE = "owner";
/** The peer a dev stack's vite proxy (and every on-box curl) arrives on — the ONLY peer the fallback mints on. */
const LOOPBACK_PEER = "127.0.0.1";
/** A LAN peer: private, but not loopback. The peer gate refuses the fallback here in EVERY posture. */
const LAN_PEER = "10.0.0.7";

/** The gate's refusal shapes, INCLUDING the arm-naming reason (#1193). Asserted by BODY so a deny is never
 *  confused with an unregistered route, and so the sentence the owner is shown cannot silently go blank. */
const ADMIN_REFUSED = "the admin-session arm refused this request (no admin or owner session on it)";
const DISABLED_BODY = {
  error: "debug API disabled — set DEBUG_TOKEN to enable",
  reason: `${ADMIN_REFUSED}, and DEBUG_TOKEN is not configured on this server`,
};
const unauthorizedBody = (tokenSent: boolean): { error: string; reason: string } => ({
  error: "unauthorized",
  reason: `${ADMIN_REFUSED}, and ${tokenSent ? "the x-debug-token sent did not match" : "no x-debug-token header was sent"}`,
});

/** The routes an un-credentialed caller must not reach. `/db/chats` and `/config/user` are the
 *  principal-blind whole-db reads the finding is actually about; `/info` is the un-gated-by-db control. */
const PROBE_PATHS = ["/api/_debug/info", "/api/_debug/db/chats", "/api/_debug/config/user"] as const;

function baseConfig(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: OWNER_HANDLE,
    verifyForwardJwt: false,
    forwardTrustedProxies: [],
    fallbackTrustedPeers: [],
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
    revokeAllForUserStatement: unused("revokeAllForUserStatement"),
    revokeByExternalId: unused("revokeByExternalId"),
    listForUser: unused("listForUser"),
    ensureUser: unused("ensureUser") as SessionsService["ensureUser"],
    provisionIdentity: unused("provisionIdentity") as SessionsService["provisionIdentity"],
    loadUserById: unused("loadUserById") as SessionsService["loadUserById"],
    resolveHandle: unused("resolveHandle") as SessionsService["resolveHandle"],
    authenticate: unused("authenticate") as SessionsService["authenticate"],
    linkExternalIdStatement: unused("linkExternalIdStatement") as SessionsService["linkExternalIdStatement"],
    settleUnclaimedLink: unused("settleUnclaimedLink") as SessionsService["settleUnclaimedLink"],
    ownerNeedsPassword: unused("ownerNeedsPassword") as SessionsService["ownerNeedsPassword"],
    claimOwnerPassword: unused("claimOwnerPassword") as SessionsService["claimOwnerPassword"],
    getOwnerUserId: unused("getOwnerUserId") as SessionsService["getOwnerUserId"],
    ...overrides,
  };
}

/** The users table the FALLBACK arm drives: `ensureUser` derives the role the real verb does (owner iff the
 *  handle is configured), `loadUserById` reads it back. The default `OWNER_HANDLES` is `["owner"]`, so the
 *  un-credentialed fallback lands on a genuine `role:"owner"` row — i.e. this fake is the WORST case, not a
 *  softened one: the principal reaching the verdict really does satisfy `can(p,'admin',global)`. */
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

/** The same fallback table with a DEMOTED row: the box's owner handle resolves to a `role:"user"` row (a
 *  hand-written demotion, the only way a live box reaches this). Arm 3's credential half passes and the ROLE
 *  half must still refuse — otherwise "loopback" alone would be admin. */
function demotedRowSessions(): SessionsService {
  return stubSessions({
    ensureUser: (handle: Handle) => Promise.resolve(castId<UserId>(`u_${handle}`)),
    loadUserById: (userId: UserId) => Promise.resolve({ role: "user" as UserRole, handle: castId<Handle>(userId), externalId: null, enabled: true }),
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
    provisionIdentity: () => Promise.resolve({ outcome: "provisioned" as const, userId: castId<UserId>("u_sso"), role, enabled: true, identityChanged: false }),
  });
}

/** A JWKS verifier that accepts any JWT as the named admin — the SIGNED forward-header path, which is the
 *  ONLY `via:"header"` sub-path this gate accepts as a credential (#1193; the unsigned twin is pinned as a
 *  refusal below). */
const acceptingJwtVerifier: ForwardJwtVerifier = {
  verify: () => Promise.resolve({ handle: castId<Handle>("sso-admin"), externalId: castId<ExternalId>("ext-1"), groups: [], email: null }),
};

interface GateApp {
  readonly fetch: (req: Request) => Response | Promise<Response>;
}

interface GateAppOptions {
  readonly config: AuthConfig;
  readonly sessions: SessionsService;
  readonly expectedToken?: string;
  readonly verifyForwardJwt?: ForwardJwtVerifier;
  /** The raw TCP peer `entry/app.ts` reads with `peerIp(c)`. Injected because a bare `app.fetch(Request)` has
   *  no socket — omitted ⇒ the seam's own fail-closed path, which is ALSO a real deployment case (a
   *  transport that cannot resolve a peer). The fallback arm mints only on a LOOPBACK value. */
  readonly peerIp?: string;
  /** `foundation/env::resolveOwnerFallbackCredential`'s verdict for this box. Omitted ⇒ the STRICT arm. */
  readonly ownerFallbackIsOperatorCredential?: boolean;
}

/**
 * Build the REAL debug surface over a REAL seam, in the exact shape `entry/app.ts` wires — INCLUDING the
 * resolve-once auth middleware, because since #1193 the gate reads the principal that middleware puts on the
 * context. Reproducing only the registrar would test a wiring that does not exist. `db` is a stub the
 * handlers would throw on: a request that gets past the gate to a /db or /config handler blows up loudly
 * rather than quietly returning an empty page, so "the gate held" can never be confused with "the read was
 * empty".
 */
function gateApp(opts: GateAppOptions): GateApp {
  const seam = createAuthSeam({
    config: opts.config,
    sessions: opts.sessions,
    ...(opts.verifyForwardJwt !== undefined ? { verifyForwardJwt: opts.verifyForwardJwt } : {}),
    ...(opts.ownerFallbackIsOperatorCredential !== undefined ? { ownerFallbackIsOperatorCredential: opts.ownerFallbackIsOperatorCredential } : {}),
  });
  const app = new Hono<PrincipalEnv>();
  app.use("*", async (c, next) => {
    const { principal, sessionId } = await seam.resolvePrincipal(c.req.raw.headers, opts.peerIp === undefined ? {} : { peerIp: opts.peerIp });
    c.set("principal", principal);
    c.set("sessionId", sessionId);
    await next();
  });
  // the real app (Hono's env generic is invariant, so the registrars take the same instance type-only
  // widened). Reproducing the production wiring is this suite's whole premise.
  // @orb-waive no-test-fabrication(unknown): not a fabricated VALUE — this is the exact `plain` widening `entry/app.ts` performs. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const widenedApp = app as unknown as Hono;
  registerDebugRoutes(widenedApp, {
    // The db must be PRESENT so `/db/*` + `/config/*` actually REGISTER — an unregistered route 404s, which
    // would forge a passing gate — but UNUSABLE, so a request that reaches a handler throws instead of
    // quietly returning an empty page. A typed factory would defeat the point: this must not answer a query.
    // @orb-waive no-test-fabrication(unknown): a deliberately unusable db is the assertion — see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    db: {} as unknown as Db,
    auth: {
      expectedToken: opts.expectedToken,
      adminAuth: { isAdmin: (c): boolean => seam.debugGateAdmits((c as Context<PrincipalEnv>).get("principal") ?? null, c.req.raw.headers) },
    },
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

/** The expected REFUSAL for every probe path, by status AND body (see the file header on why body matters).
 *  `tokenState` picks which arm-naming sentence the caller is shown. */
function allRefused(tokenState: "unconfigured" | "absent" | "mismatch"): Outcome[] {
  return PROBE_PATHS.map((path) => ({
    path,
    status: tokenState === "unconfigured" ? NOT_FOUND : UNAUTHORIZED,
    body: tokenState === "unconfigured" ? DISABLED_BODY : unauthorizedBody(tokenState === "mismatch"),
  }));
}

// The four AUTH_MODEs × a spread of `Host` values. Post-#298-f2 the Host is IRRELEVANT to the fallback (the
// raw TCP PEER decides), so these prove the debug gate denies regardless of what `Host:` an attacker forges —
// the forged-loopback and forged-private rows are the ones that used to mint owner, kept as regression pins.
// They now run WITH a loopback peer, so the denial comes from the credential rule alone.
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
      // Driven on the LOOPBACK peer — the WORST case, not a softened one: the fallback arm really does mint
      // a `role:"owner"` principal here (see `ownerRowSessions`), and the STRICT posture (the dep omitted)
      // is what refuses it. Pre-#1193 these rows leaned on the peer being absent instead.
      test(`${mode}: NO token configured, ${name} → 404 (surface off), never a handler`, async () => {
        const app = gateApp({ config: baseConfig({ mode }), sessions: sessions(), peerIp: LOOPBACK_PEER });
        expect(await outcomes(app, headers)).toEqual(allRefused("unconfigured"));
      });

      test(`${mode}: token configured, ${name}, no token sent → 401, never a handler`, async () => {
        const app = gateApp({ config: baseConfig({ mode }), sessions: sessions(), expectedToken: OPERATOR_TOKEN, peerIp: LOOPBACK_PEER });
        expect(await outcomes(app, headers)).toEqual(allRefused("absent"));
      });

      test(`${mode}: token configured, ${name}, WRONG token sent → 401`, async () => {
        const app = gateApp({ config: baseConfig({ mode }), sessions: sessions(), expectedToken: OPERATOR_TOKEN, peerIp: LOOPBACK_PEER });
        expect(await outcomes(app, { ...headers, "x-debug-token": "not-the-token" })).toEqual(allRefused("mismatch"));
      });
    }
  }

  // AUTH_FALLBACK=deny already yields no principal at all — pinned so the deny is proven to come from the
  // credential rule and not only from the fallback being configured off.
  test("single-user with fallback=deny is refused too (the deny is the credential rule, not the config)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "single-user", fallback: "deny" }),
      sessions: stubSessions({}),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LOOPBACK_PEER,
    });
    expect(await outcomes(app, { host: "127.0.0.1" })).toEqual(allRefused("absent"));
  });

  // …and with NO peer at all (a transport that cannot resolve one), which is the seam's own fail-closed path.
  test("no resolvable TCP peer is refused in every posture (the fallback arm cannot even mint)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "single-user" }),
      sessions: ownerRowSessions(),
      expectedToken: OPERATOR_TOKEN,
      ownerFallbackIsOperatorCredential: true,
    });
    expect(await outcomes(app, { host: "127.0.0.1" })).toEqual(allRefused("absent"));
  });
});

// ── ARM 3: the box operator's loopback session (#1193) ────────────────────────────────────────────────────
// The posture flag is the ONLY thing that moves between the two halves below; the peer gate is what makes the
// permissive half safe. Both are asserted, because "it works on my dev box" and "it is closed in production"
// are two different claims and this door needs both.
describe("the loopback owner fallback opens the door only where the posture says it is the operator", () => {
  test("dev posture + a LOOPBACK peer: the owner's own session is admitted (the #1193 defect)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "single-user" }),
      sessions: ownerRowSessions(),
      peerIp: LOOPBACK_PEER,
      ownerFallbackIsOperatorCredential: true,
    });
    // No cookie, no token, no header — exactly what the owner's browser sends through the dev vite proxy.
    const res = await get(app, "/api/_debug/info");
    expect(res.status).toBe(OK);
  });

  test("…and NOT with a token configured either — the operator never needs the secret on their own box", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "oidc" }),
      sessions: ownerRowSessions(),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LOOPBACK_PEER,
      ownerFallbackIsOperatorCredential: true,
    });
    expect((await get(app, "/api/_debug/info")).status).toBe(OK);
  });

  test("a LAN peer is refused on the SAME box (the peer gate, not the posture, bounds arm 3)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "single-user" }),
      sessions: ownerRowSessions(),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LAN_PEER,
      ownerFallbackIsOperatorCredential: true,
    });
    expect(await outcomes(app, { host: "127.0.0.1" })).toEqual(allRefused("absent"));
  });

  test("a DEMOTED loopback row is refused (the ROLE half of the verdict is untouched)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "single-user" }),
      sessions: demotedRowSessions(),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LOOPBACK_PEER,
      ownerFallbackIsOperatorCredential: true,
    });
    expect(await outcomes(app, {})).toEqual(allRefused("absent"));
  });

  test("the PRODUCTION posture refuses the same loopback owner, single-user included (a proxy makes everyone one)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "single-user" }),
      sessions: ownerRowSessions(),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LOOPBACK_PEER,
      ownerFallbackIsOperatorCredential: false,
    });
    expect(await outcomes(app, {})).toEqual(allRefused("absent"));
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
    expect(await outcomes(app, { cookie: "__Host-orb_session=t" })).toEqual(allRefused("absent"));
  });

  // THE HEADER ARM'S OTHER SUB-PATH (#1193). An UNSIGNED forward-header identity from an ALLOWLISTED proxy
  // peer authenticates the whole app as this admin — and is still refused HERE. The credential at this door
  // is a verified signature, never the trusted-proxy allowlist's word, so the diagnostics surface cannot
  // silently inherit whatever `FORWARD_AUTH_TRUSTED_PROXIES` happens to contain.
  test("an UNSIGNED forward-header admin from a trusted proxy is refused (only a verified JWT is a credential)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "forward-header", forwardTrustedProxies: ["127.0.0.0/8"] }),
      sessions: forwardSessions("admin"),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LOOPBACK_PEER,
    });
    // The principal really does resolve (the app would serve this caller as an admin) — the gate still says no.
    expect(await outcomes(app, { "x-authentik-username": "sso-admin" })).toEqual(allRefused("absent"));
  });
});

// THE WRITE ROUTE (#1095 — `POST /api/_debug/bug-report`, the dev bug-found button's capture). It is the one
// non-GET on this surface and the only one that touches the filesystem, so it gets its OWN admission rows here
// rather than riding `PROBE_PATHS`, which drives GETs. This suite is the route's declared enforcer: the
// cross-tenant sweep enumerates `appRouter._def.procedures` and is structurally blind to a hono route (owner
// ruling 2026-09-02), so the gate — and this file — ARE its boundary.
describe("the bug-report WRITE route is behind the same gate", () => {
  const bugReport = (app: GateApp, headers: Record<string, string> = {}): Promise<Response> =>
    Promise.resolve(
      app.fetch(
        new Request("http://host-does-not-matter/api/_debug/bug-report", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ note: "an un-credentialed caller must never reach the writer", windowMinutes: null }),
        }),
      ),
    );

  test("no token configured → 404 (surface off), and NOTHING is written", async () => {
    const app = gateApp({ config: baseConfig({ mode: "single-user" }), sessions: ownerRowSessions(), peerIp: LOOPBACK_PEER });
    const res = await bugReport(app);
    expect(res.status).toBe(NOT_FOUND);
    expect(await res.json()).toEqual(DISABLED_BODY);
  });

  test("token configured, none sent → 401, and NOTHING is written", async () => {
    const app = gateApp({ config: baseConfig({ mode: "single-user" }), sessions: ownerRowSessions(), expectedToken: OPERATOR_TOKEN, peerIp: LOOPBACK_PEER });
    const res = await bugReport(app);
    expect(res.status).toBe(UNAUTHORIZED);
    expect(await res.json()).toEqual(unauthorizedBody(false));
  });

  test("a plain USER session cookie is refused on the WRITE too", async () => {
    const app = gateApp({ config: baseConfig({ mode: "local" }), sessions: cookieSessions("user"), expectedToken: OPERATOR_TOKEN });
    const res = await bugReport(app, { cookie: "__Host-orb_session=t" });
    expect(res.status).toBe(UNAUTHORIZED);
  });

  // POSITIVE CONTROL — without it the three refusals above could pass because the route never registered.
  // A credentialed caller sending an EMPTY note reaches the handler and is refused by the SCHEMA (400), which
  // proves admission without writing a file into the repo from a unit lane.
  test("the operator's token reaches the handler (400 from the schema, not 401/404 from the gate)", async () => {
    const app = gateApp({ config: baseConfig({ mode: "single-user" }), sessions: ownerRowSessions(), expectedToken: OPERATOR_TOKEN });
    const res = await app.fetch(
      new Request("http://host-does-not-matter/api/_debug/bug-report", {
        method: "POST",
        headers: { "content-type": "application/json", "x-debug-token": OPERATOR_TOKEN },
        body: JSON.stringify({ note: "   ", windowMinutes: null }),
      }),
    );
    expect(res.status).toBe(BAD_REQUEST);
  });

  // THE #1193 DEFECT, at the exact seam it was reported from: the owner's dev browser sends no cookie, no
  // token and no header — the vite proxy delivers it on a loopback socket — and this WRITE is what the bug
  // button calls. Same empty-note trick: 400 from the schema proves the gate admitted it, with no file
  // written. A 401 here is the bug.
  test("the box operator's loopback session reaches the WRITER on a dev box (#1193)", async () => {
    const app = gateApp({
      config: baseConfig({ mode: "oidc" }),
      sessions: ownerRowSessions(),
      expectedToken: OPERATOR_TOKEN,
      peerIp: LOOPBACK_PEER,
      ownerFallbackIsOperatorCredential: true,
    });
    const res = await app.fetch(
      new Request("http://host-does-not-matter/api/_debug/bug-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "   ", windowMinutes: null }),
      }),
    );
    expect(res.status).toBe(BAD_REQUEST);
  });
});
