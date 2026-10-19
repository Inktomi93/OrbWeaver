// The oidc owner claim, end to end (the `.suite.int.test.ts` exemption: one property, many modules). A handle match to
// OWNER_HANDLES makes a subject the owner only with proof: a loopback callback with no relay header, or the boot claim
// code. OWNER_GROUP still claims. This composes the REAL login and callback routes, the REAL sessions service and OIDC
// store and a REAL database; only the IdP exchange is a fake that hands the callback chosen verified claims.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// @orb-waive-file no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
import type { SessionsRolePolicyConfig } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy, createSessionsService } from "@orb/server/domain/sessions";
import { env } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { Hono } from "hono";
import { Configuration } from "openid-client";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { createOidcStore } from "#server/domain/sessions/persistence/oidc-store.ts";
import type { OidcRoutesDeps } from "#server/entry/http/index.ts";
import { registerAuthRoutes } from "#server/entry/http/index.ts";
import type { OwnerClaimCode } from "#server/infra/auth/index.ts";
import {
  createOwnerClaimCode,
  OIDC_BINDING_COOKIE_NAME_INSECURE,
  OIDC_BINDING_COOKIE_NAME_SECURE,
  SESSION_COOKIE_NAME_INSECURE,
  SESSION_COOKIE_NAME_SECURE,
} from "#server/infra/auth/index.ts";

const PEPPER = "test-session-secret-at-least-32-chars-long";
const PUBLIC_CALLBACK = "https://app.example/api/auth/oidc/callback";
const LOOPBACK_CALLBACK = "http://localhost:8788/api/auth/oidc/callback";
const NOT_AUTHORIZED = "/login?authError=not_authorized";

/** How a login reaches the box: the raw TCP peer, the headers, and the cookie names its transport uses. */
interface Arrival {
  readonly env: { readonly incoming: { readonly socket: { readonly remoteAddress: string; readonly remotePort: number; readonly remoteFamily: string } } };
  readonly headers: Record<string, string>;
  readonly binding: string;
  readonly session: string;
}

function peer(remoteAddress: string): Arrival["env"] {
  return { incoming: { socket: { remoteAddress, remotePort: 40_000, remoteFamily: "IPv4" } } };
}

const https = { binding: OIDC_BINDING_COOKIE_NAME_SECURE, session: SESSION_COOKIE_NAME_SECURE };
const proxyHeaders = { "x-forwarded-proto": "https", "x-forwarded-host": "app.example" };
/** Through a reverse proxy on another host: a LAN peer carrying the proxy's forwarding headers. */
const viaProxy: Arrival = { env: peer("10.20.0.1"), headers: proxyHeaders, ...https };
/** Through a same-host proxy or tunnel: a loopback socket, told apart only by its relay header. */
const viaSameHostProxy: Arrival = { env: peer("127.0.0.1"), headers: proxyHeaders, ...https };
/** The box operator's own browser: a loopback socket, no relay header, plain http. */
const onLoopback: Arrival = {
  env: peer("127.0.0.1"),
  headers: { host: "localhost:8788" },
  binding: OIDC_BINDING_COOKIE_NAME_INSECURE,
  session: SESSION_COOKIE_NAME_INSECURE,
};

function claimsFor(name: string, groups: readonly string[] = []): Record<string, unknown> {
  // biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case (OIDC Core).
  return { preferred_username: name, sub: `idp|${name}`, groups: [...groups] };
}

interface Flow {
  readonly app: Hono;
  readonly db: Db;
  readonly claims: { current: Record<string, unknown> };
  readonly ownerClaim: OwnerClaimCode;
  readonly sessions: ReturnType<typeof createSessionsService>;
}

async function flow(): Promise<Flow> {
  const db = await freshDb();
  const now = (): number => FROZEN_AT_MS;
  const sessions = createSessionsService({
    rolePolicy: createSessionsRolePolicy(policyConfig),
    db: databaseHandle(db),
    now,
    sessionSecret: PEPPER,
    seedUserConnections: () => Promise.resolve(),
  });
  const ownerClaim = createOwnerClaimCode();
  const claims = { current: claimsFor("owner") };
  // biome-ignore lint/style/useNamingConvention: `authorization_endpoint` is the OIDC discovery field name.
  const issuer = { issuer: "https://idp.example", authorization_endpoint: "https://idp.example/authorize" };
  const oidc: OidcRoutesDeps = {
    getConfig: () => Promise.resolve(new Configuration(issuer, "orb-client")),
    exchange: () => Promise.resolve({ claims: claims.current, idToken: null }),
    redirectAllowlist: [PUBLIC_CALLBACK, LOOPBACK_CALLBACK],
    scope: "openid profile email",
    claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
    rolePolicy: sessions.rolePolicy,
    groupsSeparator: ";",
    allowJitProvision: true,
    requireApproval: false,
    store: createOidcStore(databaseHandle(db), now),
    ownerClaim,
  };
  const app = new Hono();
  registerAuthRoutes(app, {
    sessions,
    sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
    now,
    db: databaseHandle(db),
    resolveLoginLimit: (): number => 100,
    discreetLogin: (): boolean => false,
    oidc,
  });
  return { app, db, claims, ownerClaim, sessions };
}

function setCookie(res: Response, name: string): string | null {
  const line = res.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return line === undefined ? null : (line.slice(name.length + 1).split(";")[0] ?? "");
}

/** One whole sign-in as `name`: the authorize leg (with `query`), then the callback with the binding it set. */
async function signIn(f: Flow, arrival: Arrival, name: string, opts: { readonly groups?: readonly string[]; readonly query?: string } = {}): Promise<Response> {
  f.claims.current = claimsFor(name, opts.groups);
  const start = await f.app.request(`/api/auth/oidc/login${opts.query ?? ""}`, { headers: arrival.headers }, arrival.env);
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get("location") ?? "").searchParams.get("state") ?? "";
  const binding = setCookie(start, arrival.binding) ?? "";
  return await f.app.request(
    `/api/auth/oidc/callback?state=${state}&code=grant`,
    { headers: { ...arrival.headers, cookie: `${arrival.binding}=${binding}` } },
    arrival.env,
  );
}

async function owners(f: Flow): Promise<(typeof users.$inferSelect)[]> {
  return (await f.db.select().from(users)).filter((row) => row.role === "owner");
}

/** The box flipped from single-user or local: the seeded owner row, which carries no subject. */
async function seedUnboundOwner(f: Flow): Promise<void> {
  await f.sessions.ensureUser(castId<Handle>("owner"));
  expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: null }]);
}

function claimWarned(calls: readonly (readonly unknown[])[]): boolean {
  return calls.some(([bindings]) => (bindings as Record<string, unknown>)["event"] === "sso_owner_claim_unproven");
}

let policyConfig: SessionsRolePolicyConfig;
beforeEach(() => {
  policyConfig = { ...env };
  policyConfig = { ...policyConfig, ["OWNER_HANDLES"]: "owner" };
  policyConfig = { ...policyConfig, ["OWNER_GROUP"]: undefined };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("an OWNER_HANDLES handle match from off the box, with no claim code, takes nothing", () => {
  test.each([
    ["a reverse proxy", viaProxy],
    ["a same-host proxy or tunnel", viaSameHostProxy],
  ])("fresh oidc box, through %s: no owner row is created and no session is minted", async (_label, arrival) => {
    const f = await flow();
    const warn = vi.spyOn(logger, "warn");
    const res = await signIn(f, arrival, "owner");
    expect(res.headers.get("location")).toBe(NOT_AUTHORIZED);
    expect(setCookie(res, arrival.session)).toBeNull();
    expect(await f.db.select().from(users)).toEqual([]);
    expect(claimWarned(warn.mock.calls)).toBe(true);
  });

  test("box flipped from single-user: the unbound owner row stays unbound", async () => {
    const f = await flow();
    await seedUnboundOwner(f);
    const res = await signIn(f, viaProxy, "owner");
    expect(res.headers.get("location")).toBe(NOT_AUTHORIZED);
    expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: null }]);
  });
});

describe("the owner claims with proof", () => {
  test("fresh oidc box: a loopback callback mints the owner bound to its subject", async () => {
    const f = await flow();
    const res = await signIn(f, onLoopback, "owner");
    expect(res.headers.get("location")).toBe("/");
    expect(setCookie(res, onLoopback.session)).not.toBeNull();
    expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: "idp|owner" }]);
  });

  test("box flipped from single-user: a loopback callback binds the unbound owner row", async () => {
    const f = await flow();
    await seedUnboundOwner(f);
    await signIn(f, onLoopback, "owner");
    expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: "idp|owner" }]);
  });

  test("the boot claim code binds through the proxy, once: a second login with it proves nothing", async () => {
    const f = await flow();
    await seedUnboundOwner(f);
    const query = `?ownerClaim=${f.ownerClaim.issue()}`;
    // A member signs in first with the code: it spends the code and gets an ordinary account.
    const member = await signIn(f, viaProxy, "alice", { query });
    expect(member.headers.get("location")).toBe("/");
    const refused = await signIn(f, viaProxy, "owner", { query });
    expect(refused.headers.get("location")).toBe(NOT_AUTHORIZED);
    expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: null }]);
  });

  test("the boot claim code, presented once through the proxy, binds the unbound owner row", async () => {
    const f = await flow();
    await seedUnboundOwner(f);
    const res = await signIn(f, viaProxy, "owner", { query: `?ownerClaim=${f.ownerClaim.issue()}` });
    expect(res.headers.get("location")).toBe("/");
    expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: "idp|owner" }]);
  });

  test("an OWNER_GROUP member binds through the proxy with no code", async () => {
    policyConfig = { ...policyConfig, ["OWNER_GROUP"]: "owners" };
    const f = await flow();
    await seedUnboundOwner(f);
    const res = await signIn(f, viaProxy, "alex", { groups: ["owners"] });
    expect(res.headers.get("location")).toBe("/");
    expect(await owners(f)).toMatchObject([{ handle: "owner", externalId: "idp|alex" }]);
  });
});
