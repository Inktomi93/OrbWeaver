import { authMeSchema } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { beginOidcLogin, cookieHeader, finishOidcLogin, signInWithOidc } from "@orb/testkit/node/auth";
import { createNativeIssuer } from "@orb/testkit/node/helpers";
import type { JWTPayload } from "jose";
import type { HttpRoot } from "./oidc-native.fixtures.ts";
import { BINDING_COOKIE_PATTERN, LOGOUT_EVENT, LOGOUT_TOKEN_PARAM, MEMBER, rootFor, SESSION_COOKIE_PATTERN, writes } from "./oidc-native.fixtures.ts";

test("native JOSE backchannel uses a cached remote keyset and never accepts a foreign signature", async () => {
  const issuer = await createNativeIssuer();
  const foreign = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const cookie = await signInWithOidc(root, issuer, MEMBER);
  const claims = { sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} } } satisfies JWTPayload;
  const forged = await foreign.logoutToken(claims);
  const rejected = await root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, forged]]) });
  expect(rejected.status).toBe(400);
  const stillLive = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await stillLive.json()).authenticated).toBe(true);
  const valid = await issuer.logoutToken(claims);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, valid]]) });
    expect(result.status).toBe(200);
  }
  const dead = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await dead.json()).authenticated).toBe(false);
  expect(issuer.calls.filter((call) => call === "GET /jwks")).toHaveLength(1);
});

test("native key caches are graph-local for identical issuer/kid and survive another root's disposal", async () => {
  const firstIssuer = await createNativeIssuer();
  const secondIssuer = await createNativeIssuer();
  await using first = await rootFor(firstIssuer);
  await using second = await rootFor(secondIssuer);
  await signInWithOidc(first, firstIssuer, MEMBER);
  await signInWithOidc(second, secondIssuer, MEMBER);
  const claims = { sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} } } satisfies JWTPayload;
  const firstToken = await firstIssuer.logoutToken(claims);
  const secondToken = await secondIssuer.logoutToken(claims);
  const post = async (root: HttpRoot, token: string): Promise<Response> =>
    await root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, token]]) });
  expect((await post(first, firstToken)).status).toBe(200);
  expect((await post(second, secondToken)).status).toBe(200);
  await first[Symbol.asyncDispose]();
  await signInWithOidc(second, secondIssuer, MEMBER);
  expect((await post(second, secondToken)).status).toBe(200);
  expect(firstIssuer.calls.filter((call) => call === "GET /jwks")).toHaveLength(1);
  expect(secondIssuer.calls.filter((call) => call === "GET /jwks")).toHaveLength(1);
});

// ── The callback's code→token exchange and every arm downstream of it, through the native client ──────────────

/** Replace the issuer's token endpoint answer, keeping discovery and keys native. */

test("the mint writes the live cookie AND clears the other posture's name, in that order", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER));
  const [minted, cleared] = writes(result, SESSION_COOKIE_PATTERN);
  expect(writes(result, SESSION_COOKIE_PATTERN)).toHaveLength(2);
  expect(minted).toMatch(/^orb_session_insecure=[^;]+;/u);
  expect(minted).not.toContain("Max-Age=0");
  expect(cleared).toMatch(/^__Host-orb_session=;/u);
  expect(cleared).toContain("Max-Age=0");
  expect(authMeSchema.parse(await (await root.http.request("/api/auth/me", { headers: { cookie: cookieHeader(result) } })).json()).authenticated).toBe(true);
});

// The issuer refuses a code presented with any redirect_uri but the authorized one, so arriving on another origin
// signs in only when the exchange presents the stored, allowlisted redirect_uri.
// The route passes the transaction's nonce, so openid-client requires the ID token it binds: an issuer that omits
// one cannot sign anybody in, and no session or account is left behind.
test("the browser that started the flow completes it, and the spent binding is cleared under both names", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER));
  expect(result.headers.get("location")).toBe("/");
  const cleared = writes(result, BINDING_COOKIE_PATTERN);
  expect(cleared.map((line) => line.split("=")[0])).toEqual(["__Host-orb_oidc_state", "orb_oidc_state_insecure"]);
  expect(cleared.every((line) => line.includes("Max-Age=0"))).toBe(true);
});
