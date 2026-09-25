// OIDC login CSRF, end to end: the REAL authorize route, the REAL transaction store over a real database, and
// the REAL callback, driven through Hono so cookies cross real headers. Each "browser" is the cookie jar one
// login response wrote. The exchange is the only fake; it counts calls so a refused callback can prove it
// never reached the IdP.

import type { Db } from "@orb/db";
import { sessions as sessionsTable, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createOidcStore, createSessionsService } from "@orb/server/domain/sessions";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import type { AuthRoutesDeps } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import type { OidcVerifiedTokens } from "@orb/server/infra/auth";
import { OIDC_BINDING_COOKIE_NAME_SECURE, SESSION_COOKIE_NAME_SECURE } from "@orb/server/infra/auth";
import { Hono } from "hono";
import { Configuration } from "openid-client";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

const NOW = 1_750_000_000_000;
const APP_HOST = "app.example";
const CALLBACK_URI = `https://${APP_HOST}/api/auth/oidc/callback`;
// biome-ignore lint/style/useNamingConvention: `authorization_endpoint` is the OIDC discovery field name.
const ISSUER = { issuer: "https://idp.example", authorization_endpoint: "https://idp.example/authorize" };
const PEPPER = "test-session-secret-at-least-32-chars-long";
const USER_ID = castId<UserId>("user_alice");
/** A browser on the allowlisted https origin, behind the TLS proxy on this host. */
const ALLOWLISTED_ORIGIN = { "x-forwarded-proto": "https", "x-forwarded-host": APP_HOST };
/** The proxy's loopback socket: a trusted hop, so `X-Forwarded-Proto: https` is believed. */
const PROXY_PEER = { incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 40_000, remoteFamily: "IPv4" } } };
// biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case (OIDC Core).
const CLAIMS: Record<string, unknown> = { preferred_username: "alice", sub: "sub-alice" };

let db: Db;
let sessions: SessionsService;
let app: Hono;
let exchanges: number;

beforeEach(async () => {
  db = await freshDb();
  await db
    .insert(users)
    .values({ id: USER_ID, handle: castId<Handle>("alice"), handleKey: handleKey(castId<Handle>("alice")), externalId: castId<ExternalId>("sub-alice") });
  const now = (): number => NOW;
  sessions = createSessionsService({ db, now, sessionSecret: PEPPER, seedUserConnections: createLocalLightUserSeed({ db, now }) });
  exchanges = 0;
  app = new Hono();
  const deps: AuthRoutesDeps = {
    sessions,
    sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
    now,
    db,
    resolveLoginLimit: (): number => 10,
    oidc: {
      getConfig: (): Promise<Configuration> => Promise.resolve(new Configuration(ISSUER, "orb-client")),
      exchange: (): Promise<OidcVerifiedTokens> => {
        exchanges += 1;
        return Promise.resolve({ claims: CLAIMS, idToken: null });
      },
      redirectAllowlist: [CALLBACK_URI],
      scope: "openid profile email",
      claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
      groupsSeparator: ";",
      allowJitProvision: true,
      requireApproval: false,
      store: createOidcStore(db, now),
    },
  };
  registerAuthRoutes(app, deps);
});

/** One browser's start of a login: the `state` the IdP will return and the binding pair its jar now holds. */
interface StartedLogin {
  readonly state: string;
  readonly cookie: string;
}

async function startLogin(): Promise<StartedLogin> {
  const res = await app.request("/api/auth/oidc/login", { headers: ALLOWLISTED_ORIGIN }, PROXY_PEER);
  expect(res.status).toBe(302);
  const state = new URL(res.headers.get("location") ?? "").searchParams.get("state") ?? "";
  const binding = res.headers.getSetCookie().find((value) => value.startsWith(`${OIDC_BINDING_COOKIE_NAME_SECURE}=`)) ?? "";
  return { state, cookie: binding.split(";")[0] ?? "" };
}

/** The IdP's redirect back, opened in a browser whose jar holds `cookie` (none when omitted). */
async function openCallback(state: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { ...ALLOWLISTED_ORIGIN, ...(cookie !== undefined && { cookie }) };
  return await app.request(`/api/auth/oidc/callback?state=${state}&code=auth-code`, { headers }, PROXY_PEER);
}

function mintedSessionToken(res: Response): SessionToken | null {
  const pair = res.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE_NAME_SECURE}=`));
  return pair === undefined ? null : castId<SessionToken>(pair.slice(SESSION_COOKIE_NAME_SECURE.length + 1).split(";")[0] ?? "");
}

describe("OIDC login CSRF — the callback completes only in the browser that started the flow", () => {
  test("a browser's own flow round-trips: the binding it was given admits its callback and mints a working session", async () => {
    const victim = await startLogin();
    expect(victim.state).not.toBe("");
    expect(victim.cookie).toBe(`${OIDC_BINDING_COOKIE_NAME_SECURE}=${victim.state}`);

    const res = await openCallback(victim.state, victim.cookie);

    expect(res.headers.get("location")).toBe("/");
    const token = mintedSessionToken(res);
    expect(token).not.toBeNull();
    expect((await sessions.validate(token ?? castId<SessionToken>("")))?.userId).toBe(USER_ID);
  });

  test("the attacker's stopped callback opened in the victim's browser mints nothing, even with a live transaction", async () => {
    const attacker = await startLogin();
    const victim = await startLogin();

    const res = await openCallback(attacker.state, victim.cookie);

    expect(res.headers.get("location")).toBe("/login?authError=invalid_state");
    expect(mintedSessionToken(res)).toBeNull();
    expect(exchanges).toBe(0);
    expect(await db.select().from(sessionsTable)).toEqual([]);
  });

  test("the attacker's stopped callback opened in a browser with no binding mints nothing", async () => {
    const attacker = await startLogin();

    const res = await openCallback(attacker.state);

    expect(res.headers.get("location")).toBe("/login?authError=invalid_state");
    expect(mintedSessionToken(res)).toBeNull();
    expect(exchanges).toBe(0);
    expect(await db.select().from(sessionsTable)).toEqual([]);
  });
});
