// Cross-writer drift-equality suite (the `.suite.test.ts` exemption: one property, MANY source modules).
//
// The `__Host-orb_session` cookie is read by THREE independent call paths:
//   1. the auth seam        — `entry/auth/seam.ts` → `sessions.validate(token)` (what AUTHENTICATES you)
//   2. the logout route     — `entry/http/auth-routes.ts` → `sessions.revokeByToken(token)` (what KILLS it)
//   3. the app middleware   — `entry/app.ts` → the expiry-slide `Set-Cookie` re-issue (what KEEPS it)
//
// A parse divergence between them is a security defect, not a style problem: if the seam extracts token A
// while logout extracts token B, a user's "log out" revokes nothing and the live session survives; if the
// slide re-issues B after the seam validated A, the next request carries a token that authenticates nobody
// (a silent logout) — or, worse, whatever value the attacker got the parser to prefer.
//
// So this suite drives all three paths over the SAME crafted `Cookie` headers — including the shapes a
// browser, a proxy, or an attacker can actually produce (quoted values, percent-encoding, a duplicated
// cookie NAME, duplicated Cookie HEADERS, a name-prefix shadowing attempt, broken percent-escapes) — and
// asserts ONE answer. It pins parse BEHAVIOR, not implementation: it passed against the old three-copy
// source and must keep passing against the single shared reader.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { SessionsService } from "@orb/server/domain/sessions";
import type { SeamResult } from "@orb/server/entry/auth";
import { createAuthSeam } from "@orb/server/entry/auth";
import type { AuthSessionsPort } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import type { AuthConfig } from "@orb/server/infra/auth";
import { Hono } from "hono";
import { describe } from "vitest";
import { layer } from "../../../packages/server/src/domain/settings/effective-config/layer.ts";
import type { AppDeps } from "../../../packages/server/src/entry/app.ts";
import { createApp } from "../../../packages/server/src/entry/app.ts";
import { expect, test } from "../../support/fixtures.ts";

const COOKIE_NAME = "__Host-orb_session";
const FROZEN_NOW = 1_750_000_000_000;
const SLIDE_MS = 60_000;

/** Build the request headers from one entry PER `Cookie` header line — a two-element list models the
 *  duplicate-Cookie-header shape (`Headers` joins repeats with `, `, exactly as undici/Node does). */
function craft(cookieLines: readonly string[]): Headers {
  return new Headers(cookieLines.map((value): [string, string] => ["cookie", value]));
}

// ── path 1: the auth seam (what authenticates) ───────────────────────────────────────────────────

function seamConfig(): AuthConfig {
  return {
    mode: "local",
    // `deny` so a missing/rejected cookie can never fall through to the owner fallback — this probe must
    // observe the COOKIE parse and nothing else.
    fallback: "deny",
    defaultHandle: "owner",
    verifyForwardJwt: false,
    forwardTrustedProxies: [],
    jwksAllowlist: [],
  };
}

/** A SessionsService whose unused verbs throw — the seam's cookie path must touch `validate` and nothing
 *  else, so an unexpected verb fails the probe loudly instead of silently. */
function stubSessions(validate: SessionsService["validate"]): SessionsService {
  const unused = (name: string) => (): never => {
    throw new Error(`unexpected sessions.${name}`);
  };
  return {
    validate,
    create: unused("create"),
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
  };
}

/** The token string `sessions.validate` receives, or null when the seam extracted nothing. */
async function viaSeam(cookieLines: readonly string[]): Promise<string | null> {
  const seen: string[] = [];
  const seam = createAuthSeam({
    config: seamConfig(),
    sessions: stubSessions((token) => {
      seen.push(token);
      return Promise.resolve(null);
    }),
  });
  await seam.resolvePrincipal(craft(cookieLines));
  return seen[0] ?? null;
}

// ── path 2: the logout route (what revokes) ──────────────────────────────────────────────────────

// The logout route never dereferences `db` (only `registerLoginRoute` builds a limiter, and this probe
// supplies no `authenticate` so that route is not registered).
// @orb-waive no-test-fabrication(unknown): never-dereferenced registration-only stand-in. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

/** W7a — the logout route evicts the ended session's live sockets; this probe drives no socket at all. */
const INERT_EVICTION = { evictSession: (): number => 0, evictUser: (): number => 0 };

/** The token string `sessions.revokeByToken` receives, or null when the route extracted nothing. */
async function viaLogout(cookieLines: readonly string[]): Promise<string | null> {
  const seen: string[] = [];
  const sessions: AuthSessionsPort = {
    create: () => Promise.reject(new Error("unexpected sessions.create")),
    provisionIdentity: () => Promise.reject(new Error("unexpected sessions.provisionIdentity")),
    revokeByExternalId: () => Promise.reject(new Error("unexpected sessions.revokeByExternalId")),
    revokeByToken: (token) => {
      seen.push(token);
      // W7a — the verb reports WHICH session ended so the route can evict its sockets. This probe is about
      // WHICH TOKEN was extracted, so it reports "already revoked": nothing to evict, nothing to assert.
      return Promise.resolve(null);
    },
  };
  const app = new Hono();
  registerAuthRoutes(app, { sessions, sockets: INERT_EVICTION, now: (): number => FROZEN_NOW, db: NO_DB, resolveLoginLimit: (): number => 10 });

  const headers = craft(cookieLines);
  headers.set(CSRF_HEADER, "1"); // logout is CSRF-gated; without it the route 403s before parsing
  const res = await app.fetch(new Request("http://localhost/api/auth/logout", { method: "POST", headers }));
  expect(res.status).toBe(200); // A6 — logout returns 200 `{endSessionUrl}` (null with no oidc deps), not 204
  return seen[0] ?? null;
}

// ── path 3: the app middleware's expiry-slide re-issue (what keeps the session alive) ────────────

// The registry must carry the CHAT descriptor — `POST /api/import/chat` resolves it at REGISTRATION and
// refuses to mount without one. This probe never drives the import leg; the descriptor's presence is all
// `createApp` needs.
const inertChatPortability: PortableEntity = {
  kind: "chat",
  dir: "chats/",
  ext: ".jsonl",
  async *exportAll(): AsyncIterable<PortableFile> {
    // inert: this suite never streams an export.
  },
  importFile: () => Promise.resolve({ ok: false, error: "inert in the cookie-parity suite" }),
};

// `app.fetch(req)` supplies no node socket env, and the auth middleware's `peerIp` read throws without one
// (`@hono/node-server`'s getConnInfo reads `c.env.incoming.socket.*`). This mirrors what the node server
// binds in production; the fake seam ignores the resolved peer.
const PEER_ENV = {
  incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 54_321, remoteFamily: "IPv4" } },
};

/** Build `AppDeps` with the ports this probe never touches stubbed — the middleware chain it DOES drive
 *  (security headers → auth → observability → healthz) needs only the seam + the settings read. */
function appDeps(): AppDeps {
  // @orb-waive no-test-fabrication(never): the ports whose routes this probe never drives (covered by their own slice tests). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const untouched = {} as never;
  // Only the settings slice is read here (the CSP + auth-meta live reads); the other domain services are
  // deliberately absent — their routes are covered by their own slice tests.
  // @orb-waive no-test-fabrication(unknown): settings-only slice of the 17-service bundle. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const services = { settings: { getEffectiveConfig: (): EffectiveAppConfig => layer({}) } } as unknown as AppDeps["services"];
  return {
    now: (): number => FROZEN_NOW,
    db: NO_DB,
    oidcProviderName: "your identity provider",
    seam: {
      // The slide fires on every request: the middleware re-issues Set-Cookie ONLY from the token it
      // itself parsed off the Cookie header, so the header value is this probe's observable.
      resolvePrincipal: (_headers, req): Promise<SeamResult> => {
        req?.onSessionSlide?.(FROZEN_NOW + SLIDE_MS);
        return Promise.resolve({ principal: null, sessionId: null, csrfHeaderPresent: false });
      },
      debugGateAdmits: (): boolean => false,
    },
    services,
    rateLimit: { enforce: (): Promise<void> => Promise.resolve() },
    presence: {
      connect: (): void => {
        // inert: this suite never exercises the presence ref-count.
      },
      read: (userId) => ({ userId, online: true, lastSeenAt: null }),
    },
    sockets: untouched,
    assets: untouched,
    cas: untouched,
    character: untouched,
    exportService: untouched,
    portability: [inertChatPortability],
    importWorldInfo: untouched,
    sessions: untouched,
    isShuttingDown: (): boolean => false,
    credentialsKeyOk: (): boolean => true,
    seedUserCharacters: (): void => {
      // inert: the resolved principal is always null here.
    },
  };
}

const SET_COOKIE_PREFIX = `${COOKIE_NAME}=`;

/** The token the slide re-issued, read back off the real `Set-Cookie` response header. */
function tokenFromSetCookie(raw: string | null): string | null {
  if (raw === null || !raw.startsWith(SET_COOKIE_PREFIX)) {
    return null;
  }
  const end = raw.indexOf(";");
  return raw.slice(SET_COOKIE_PREFIX.length, end === -1 ? undefined : end);
}

async function viaSlide(cookieLines: readonly string[]): Promise<string | null> {
  const app = createApp(appDeps());
  const res = await app.fetch(new Request("http://localhost/healthz", { headers: craft(cookieLines) }), PEER_ENV);
  return tokenFromSetCookie(res.headers.get("set-cookie"));
}

// ── the parity property ──────────────────────────────────────────────────────────────────────────

interface ThreeReads {
  readonly seam: string | null;
  readonly logout: string | null;
  readonly slide: string | null;
}

/** Drive all three readers over the same crafted `Cookie` header. */
async function readAllThree(cookieLines: readonly string[]): Promise<ThreeReads> {
  const [seam, logout, slide] = await Promise.all([viaSeam(cookieLines), viaLogout(cookieLines), viaSlide(cookieLines)]);
  return { seam, logout, slide };
}

/** The parity expectation: all three paths extracted the SAME token (or all three extracted none). */
function allAgreeOn(token: string | null): ThreeReads {
  return { seam: token, logout: token, slide: token };
}

describe("session-cookie readers agree across the validate / revoke / re-issue paths", () => {
  test("a plain cookie value reaches all three readers identically", async () => {
    expect(await readAllThree([`${COOKIE_NAME}=tok-simple`])).toEqual(allAgreeOn("tok-simple"));
  });

  test("surrounding cookies + whitespace around the name and value are trimmed the same way", async () => {
    expect(await readAllThree([`ab=1; ${COOKIE_NAME}= tok-ws ; z=2`])).toEqual(allAgreeOn("tok-ws"));
  });

  test("percent-encoded octets decode identically (a decode-on-one-path-only split would break revoke)", async () => {
    expect(await readAllThree([`${COOKIE_NAME}=tok%2Bplus%2Fslash`])).toEqual(allAgreeOn("tok+plus/slash"));
  });

  test("a broken percent-escape is null on ALL three (the decode throw fails closed, never a 500)", async () => {
    expect(await readAllThree([`${COOKIE_NAME}=%E0%A4%A`])).toEqual(allAgreeOn(null));
  });

  test("an RFC-6265 quoted value keeps its quotes on all three (no path silently unquotes)", async () => {
    // We deliberately do NOT unquote: the quotes ride into the token, the peppered-hash lookup misses, and
    // the request is anonymous. What matters here is that all three paths agree on that miss.
    expect(await readAllThree([`${COOKIE_NAME}="tok-quoted"`])).toEqual(allAgreeOn('"tok-quoted"'));
  });

  test("a DUPLICATED cookie name resolves to the FIRST occurrence on all three (no last-wins split)", async () => {
    // The attack this pins: if one reader took the first pair and another the last, an injected second
    // `__Host-orb_session` would let logout revoke a decoy while the seam kept authenticating the real one.
    expect(await readAllThree([`${COOKIE_NAME}=first; ${COOKIE_NAME}=second`])).toEqual(allAgreeOn("first"));
  });

  test("a name-PREFIXED impostor cookie never shadows the real one on any path", async () => {
    expect(await readAllThree([`x${COOKIE_NAME}=impostor; ${COOKIE_NAME}=real`])).toEqual(allAgreeOn("real"));
  });

  test("a name-SUFFIXED impostor cookie is not a match on any path (null, not the impostor's value)", async () => {
    expect(await readAllThree([`${COOKIE_NAME}_extra=impostor`])).toEqual(allAgreeOn(null));
  });

  test("duplicate Cookie HEADERS: our cookie behind another one is found by all three", async () => {
    // `Headers` special-cases `cookie` and joins repeated lines with `; ` (undici, per the fetch spec's
    // cookie carve-out) — so the second header's pair stays a real pair and every reader finds it.
    expect(await readAllThree(["a=1", `${COOKIE_NAME}=tok-behind`])).toEqual(allAgreeOn("tok-behind"));
  });

  test("duplicate Cookie HEADERS: our cookie first, a trailing header after it — same answer on all three", async () => {
    expect(await readAllThree([`${COOKIE_NAME}=tok-first`, "b=2"])).toEqual(allAgreeOn("tok-first"));
  });

  test("a value containing '=' splits on the FIRST '=' on all three", async () => {
    expect(await readAllThree([`${COOKIE_NAME}=a=b=c`])).toEqual(allAgreeOn("a=b=c"));
  });

  test("no Cookie header at all is null on all three", async () => {
    expect(await readAllThree([])).toEqual(allAgreeOn(null));
  });
});
