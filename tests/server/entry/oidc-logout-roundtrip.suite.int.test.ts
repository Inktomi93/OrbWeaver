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
//   entry/http/auth-routes callback → the injected code→token exchange (#867)
//     → domain/sessions verbs/create (seals, AAD = row id) → the sessions row
//       → entry/http/auth-routes logout → domain/sessions verbs/revoke (opens + consumes) → the URL
//
// #867 CLOSED THE FIRST HOP. It used to read "the one hop this cannot cover": `authorizationCodeGrant` was
// a module-level `openid-client` import in `auth-routes.ts`, the package resolves only under
// `packages/server/node_modules` (so a `vi.mock("openid-client")` from `tests/` never binds — the real
// library runs and the callback reports `token_exchange_failed` while LOOKING wired), and the path-form
// mock that would bind is correctly RED under `test-mock-doctrine`. The doctrine's own answer — inject at
// the composition root — is now what `OidcRoutesDeps.exchange` is, so the FULL login→logout thread is
// driven here end to end: a fake exchange hands the callback a known id_token, the REAL callback threads it
// into the REAL create verb, the row is checked to hold no plaintext, the minted cookie is checked to
// AUTHENTICATE (`sessions.validate` — the read `sessions.me` projects), and the REAL logout spends the hint.
//
// STILL NOT COVERED HERE, and it belongs elsewhere: the grant's CRYPTOGRAPHY (JWKS signature, issuer and
// audience validation, nonce/PKCE binding) is `openid-client`'s, and an e2e OIDC mode against a mock IdP
// (`tests/e2e/support/modes.ts`) remains deferred — injecting the seam does not give the e2e stack a fake
// IdP, because that stack boots the real server, which wires the real grant by design.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { sessions as sessionsTable, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle, SessionToken, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import type { AuthRoutesDeps, OidcRoutesDeps } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import type { OidcTransaction, OidcVerifiedTokens } from "@orb/server/infra/auth";
import { createOwnerClaimCode, OIDC_BINDING_COOKIE_NAME_SECURE } from "@orb/server/infra/auth";
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
/** The TLS proxy on this host: a loopback socket peer, so its `X-Forwarded-Proto: https` is believed and the
 *  session rides the https cookie (`infra/auth/transport.ts`). */
const PROXY_PEER = { incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 40_000, remoteFamily: "IPv4" } } };
/** #867 — the PKCE/state transaction the authorize leg minted; the callback consumes it single-use. Its
 *  `redirectUri` is the allowlisted callback the exchange must be presented, whatever origin the request
 *  arrives on. */
const TX: OidcTransaction = { state: "st-1", codeVerifier: "cv-1", nonce: "nonce-1", redirectUri: CALLBACK_URI, createdAt: NOW, inviteTokenHash: null };
/** The claims the fake exchange yields — a usable username AND the stable subject `oidcSessionIdentity`
 *  requires. `alice` is the seeded row, so provisioning binds the subject onto it. */
// biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case (OIDC Core).
const CALLBACK_CLAIMS: Record<string, unknown> = { preferred_username: "alice", sub: "sub-alice" };

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
  // @orb-waive no-test-fabrication(unknown): openid-client's Configuration has no test constructor and only `serverMetadata()` is exercised here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return stub as unknown as OidcConfig;
}

beforeEach(async () => {
  db = await freshDb();
  // Already BOUND to the subject the callback's claims carry — the returning-SSO-user shape, so
  // provisioning takes the subject-match update path. (Seeding it UNBOUND makes the MS-W1 collision
  // hard-deny fire instead, which is that control working: a subject-bearing login may never auto-link
  // onto an existing unbound account by handle.)
  await db
    .insert(users)
    .values({ id: USER_ID, handle: castId<Handle>("alice"), handleKey: handleKey(castId<Handle>("alice")), externalId: castId<ExternalId>("sub-alice") });
  sessions = createSessionsService({
    db,
    now: (): number => NOW,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: (): number => NOW, onEmbedSpaceBound: () => undefined }),
  });
  app = new Hono();
  const deps: AuthRoutesDeps = {
    sessions,
    sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
    now: (): number => NOW,
    db,
    resolveLoginLimit: (): number => 10,
    discreetLogin: (): boolean => false,
    oidc: {
      getConfig: (): Promise<OidcConfig> => Promise.resolve(fakeConfig()),
      redirectAllowlist: [CALLBACK_URI],
      scope: "openid profile email",
      claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
      groupsSeparator: ";",
      allowJitProvision: true,
      requireApproval: false,
      ownerClaim: createOwnerClaimCode(),
      // #867 — the real callback needs a real-shaped exchange. The deterministic fake stands in for a
      // grant `openid-client` has already verified; the SEAM under test is what the route does with it.
      exchange: (): Promise<OidcVerifiedTokens> => Promise.resolve({ claims: CALLBACK_CLAIMS, idToken: ID_TOKEN }),
      // The transaction the authorize leg minted, returned single-use by the callback's consume.
      store: { mint: (): Promise<void> => Promise.resolve(), consume: (): Promise<OidcTransaction | null> => Promise.resolve(TX) },
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
  const res = await app.request(
    "/api/auth/logout",
    {
      method: "POST",
      headers: { cookie: `${COOKIE_NAME}=${token}`, [CSRF_HEADER]: "1", ...origin },
    },
    PROXY_PEER,
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { endSessionUrl: string | null }).endSessionUrl;
}

/** Drive the REAL OIDC callback and return the `__Host-orb_session` token it minted. Nothing is stubbed
 *  between the exchange and the database: the route provisions through the real verb, mints through the
 *  real create verb, and the cookie is whatever the route actually wrote. The browser carries the binding
 *  the authorize leg set for `TX.state` (`oidc-login-binding.suite.int.test.ts` proves that leg). */
async function signInViaCallback(): Promise<SessionToken> {
  const res = await app.request(
    `/api/auth/oidc/callback?state=${TX.state}&code=auth-code`,
    { headers: { ...ALLOWLISTED_ORIGIN, cookie: `${OIDC_BINDING_COOKIE_NAME_SECURE}=${TX.state}` } },
    PROXY_PEER,
  );
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/");
  const setCookie = res.headers.get("set-cookie") ?? "";
  const token = /__Host-orb_session=([^;]+)/u.exec(setCookie)?.[1];
  expect(token).toBeDefined();
  return castId<SessionToken>(token ?? "");
}

// #867 — THE HOP THAT HAD NO PIN. Every assertion below was unreachable while the exchange was a
// module-level import: this is the callback's own `exchange.idToken → sessions.create({ oidcIdToken })`
// thread, proven against a real database rather than a stubbed sessions port.
describe("#867 — the OIDC CALLBACK is the writer: exchange → sessions.create (sealed) → a usable session", () => {
  test("the callback mints a session that AUTHENTICATES, with the id_token sealed at rest and no plaintext in the row", async () => {
    const token = await signInViaCallback();

    // The cookie the callback wrote is a real credential — this is the read `sessions.me` projects.
    const validated = await sessions.validate(token);
    expect(validated?.userId).toBe(USER_ID);

    // …and the id_token the IdP returned is in the row SEALED, never in the clear. Both halves matter: a
    // row with no ciphertext means the callback dropped the token; a row containing the plaintext means
    // the seal was bypassed.
    const rows = await db.select().from(sessionsTable);
    expect(rows[0]?.oidcIdTokenCiphertext).not.toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain(ID_TOKEN);
  });

  test("the callback's id_token is the one the LOGOUT spends — the full login→logout thread", async () => {
    const token = await signInViaCallback();
    const url = new URL((await signOut(token, ALLOWLISTED_ORIGIN)) ?? "");

    // Byte-identical from the exchange, through the seal, out of the revoke, into the IdP's hint param.
    expect(url.searchParams.get("id_token_hint")).toBe(ID_TOKEN);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(`https://${APP_HOST}/login`);
  });
});

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
