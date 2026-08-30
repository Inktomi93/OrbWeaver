// #141 — THE OIDC LOGOUT ROUND-TRIP (the `.suite.int.test.ts` exemption: one property, many modules).
//
// Owner-observed defect (2026-08-17): signing out of Orbweaver under OIDC dumped the user on authentik's
// generic end-session page instead of returning to our own /login. The fix the owner ruled (2026-08-30) is
// to persist the OIDC `id_token` server-side, encrypted at rest, and send it as `id_token_hint` alongside
// `post_logout_redirect_uri`. Neither param works without the other: authentik 2026.5.5's
// `EndSessionView.validate` raises `id_token_hint_missing` BEFORE the flow planner when a redirect URI
// arrives unpaired, so the invalidation flow never runs and THE SSO SESSION SURVIVES (regression #437).
//
// WHAT ONLY THIS FILE CAN SEE. The route unit tests (`http/auth-routes.test.ts`) stub the sessions PORT, so
// they prove the URL the route builds from a hint it was handed. The domain tests
// (`domain/sessions/verbs/*.int.test.ts`) prove the seal/open/consume over a real database, but never touch
// a route. Neither can fail if the two halves stop agreeing — a hint that is sealed correctly and read by a
// route that no longer asks for it is green in both. So this suite composes the REAL `domain/sessions`
// service, a REAL database and the REAL logout route, and asserts the id_token that went in is the one that
// comes back out in the end-session URL:
//
//   domain/sessions verbs/create (seals, AAD = row id) → the sessions row
//     → entry/http/auth-routes logout → domain/sessions verbs/revoke (opens + consumes) → the URL
//
// THE ONE HOP IT DOES NOT COVER, stated rather than faked: the OIDC CALLBACK's own
// `exchange.idToken → sessions.create({ oidcIdToken })` thread. `authorizationCodeGrant` is a module-level
// `openid-client` import in `auth-routes.ts` rather than an injected dep, so the callback's happy path has
// never been drivable in-process — the same documented absence `http/auth-routes.test.ts` carries above its
// callback describe, and `tests/e2e/support/modes.ts:262` carries for e2e. Faking it would mean `vi.mock`
// against a relative path into `packages/server/node_modules`, which `test-mock-doctrine` correctly REDs:
// the doctrine's answer is to inject the exchange at the composition root, which is a change to the
// token-exchange seam and outside this lane's ruling. Filed as a follow-up instead.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { sessions as sessionsTable, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import type { AuthRoutesDeps, OidcRoutesDeps } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import { Hono } from "hono";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

/** The compact ID token standing in for what the IdP returned at the callback. Nothing under test parses
 *  it; its BYTES are the assertion — a mangled hint is one authentik rejects. */
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.round-trip-signature-not-verified";
const NOW = 1_750_000_000_000;
const COOKIE_NAME = "__Host-orb_session";
const APP_HOST = "app.example";
const CALLBACK_URI = `https://${APP_HOST}/api/auth/oidc/callback`;
const END_SESSION = "https://idp.example/application/o/orb/end-session/";
/** ≥32 chars — the pepper the composition root binds from `SESSION_SECRET` for BOTH the token hash and
 *  (since #141) the HKDF-derived id_token cipher key. */
const PEPPER = "test-session-secret-at-least-32-chars-long";
const USER_ID = castId<UserId>("user_alice");
const ALLOWLISTED_ORIGIN = { "x-forwarded-proto": "https", "x-forwarded-host": APP_HOST };

let db: Db;
let sessions: SessionsService;
let app: Hono;

/** The openid-client `Configuration` type, borrowed through the deps surface (the tests workspace does not
 *  depend on openid-client directly). */
type OidcConfig = Awaited<ReturnType<OidcRoutesDeps["getConfig"]>>;

/** The one method the logout path reads off the discovered `Configuration` — the discovery document's
 *  wire-fixed `end_session_endpoint`. */
function fakeConfig(): OidcConfig {
  const stub = {
    serverMetadata: (): Record<string, string> => ({
      // biome-ignore lint/style/useNamingConvention: `end_session_endpoint` is the OIDC discovery field name.
      end_session_endpoint: END_SESSION,
    }),
  };
  // FABRICATION-OK: openid-client's Configuration has no test constructor and only `serverMetadata()` is exercised here.
  return stub as unknown as OidcConfig;
}

beforeEach(async () => {
  db = await freshDb();
  await db.insert(users).values({ id: USER_ID, handle: castId<Handle>("alice") });
  sessions = createSessionsService({ db, now: (): number => NOW, sessionSecret: PEPPER });
  app = new Hono();
  const deps: AuthRoutesDeps = {
    sessions,
    sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
    now: (): number => NOW,
    db,
    resolveLoginLimit: (): number => 10,
    oidc: {
      getConfig: (): Promise<OidcConfig> => Promise.resolve(fakeConfig()),
      redirectAllowlist: [CALLBACK_URI],
      scope: "openid profile email",
      claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
      groupsSeparator: ";",
      allowJitProvision: true,
      requireApproval: false,
      store: { mint: (): Promise<void> => Promise.resolve(), consume: (): Promise<null> => Promise.resolve(null) },
    },
  };
  registerAuthRoutes(app, deps);
});

/** Mint the session the OIDC callback would have minted, carrying the IdP's id_token. */
async function signInWith(idToken: string | null): Promise<string> {
  const { token } = await sessions.create({ userId: USER_ID, userAgent: "Firefox/1.0", oidcIdToken: idToken });
  return token;
}

/** Drive the REAL logout route with that cookie and return the `endSessionUrl` it hands the client. */
async function signOut(token: string, origin: Record<string, string>): Promise<string | null> {
  const res = await app.request("/api/auth/logout", {
    method: "POST",
    headers: { cookie: `${COOKIE_NAME}=${token}`, [CSRF_HEADER]: "1", ...origin },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { endSessionUrl: string | null }).endSessionUrl;
}

describe("#141 — the id_token round-trips from the session row into the end-session URL", () => {
  test("the hint reaches the URL byte-identical, paired with our own /login as the return target", async () => {
    const token = await signInWith(ID_TOKEN);
    // Nothing in between ever holds the plaintext: the row is sealed the moment it is written.
    const seeded = await db.select().from(sessionsTable);
    expect(JSON.stringify(seeded[0])).not.toContain(ID_TOKEN);

    const url = new URL((await signOut(token, ALLOWLISTED_ORIGIN)) ?? "");

    expect(url.origin + url.pathname).toBe(END_SESSION);
    // THE ROUND TRIP — sealed at the domain, opened at the domain, spent at the route.
    expect(url.searchParams.get("id_token_hint")).toBe(ID_TOKEN);
    // ...and the owner-observed papercut, closed: the IdP sends the browser back to OUR login screen.
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(`https://${APP_HOST}/login`);
  });

  test("the hint is CONSUMED — the row keeps no secret at rest, and a repeat logout gets a BARE URL", async () => {
    const token = await signInWith(ID_TOKEN);
    await signOut(token, ALLOWLISTED_ORIGIN);

    const rows = await db.select().from(sessionsTable);
    expect(rows[0]?.oidcIdTokenCiphertext).toBeNull();
    expect(rows[0]?.oidcIdTokenIv).toBeNull();
    expect(rows[0]?.oidcIdTokenTag).toBeNull();

    // The cookie is dead, so the second logout ends nothing and has no hint to pair a redirect with. BARE
    // is the required shape: an unpaired `post_logout_redirect_uri` is the #437 400, on an origin that
    // WOULD have resolved.
    const repeat = await signOut(token, ALLOWLISTED_ORIGIN);
    expect(repeat).toBe(END_SESSION);
    expect(new URL(repeat ?? "").search).toBe("");
  });

  test("a LOCAL login's logout sends the bare URL — no hint, and therefore no redirect param either", async () => {
    const token = await signInWith(null);
    const endSessionUrl = await signOut(token, ALLOWLISTED_ORIGIN);
    expect(endSessionUrl).toBe(END_SESSION);
    expect(new URL(endSessionUrl ?? "").search).toBe("");
  });

  test("an OFF-ALLOWLIST origin at logout cannot inject a return target, and the hint still rides", async () => {
    const token = await signInWith(ID_TOKEN);
    // `evil.example` is not in OIDC_REDIRECT_URIS; handing it to the OP would be an open redirect
    // laundered through the IdP.
    const url = new URL((await signOut(token, { "x-forwarded-proto": "https", "x-forwarded-host": "evil.example" })) ?? "");

    expect(url.href).not.toContain("evil.example");
    expect(url.searchParams.has("post_logout_redirect_uri")).toBe(false);
    expect(url.searchParams.get("id_token_hint")).toBe(ID_TOKEN);
  });
});
