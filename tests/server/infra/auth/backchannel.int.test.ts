// Native logout verification is assembled by the real OIDC composition owner, not a private infra import.
// @subject packages/server/src/infra/auth/backchannel.ts
import { databaseHandle } from "@orb/db/wiring-driver";
import { createConfiguredOidc } from "@orb/server/entry/compose";
import { test as base, expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CLIENT_ID, createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const SUBJECT = "authentik|alice";
const KEY_URL = new URL("jwks", ISSUER).href;

type Issuer = Awaited<ReturnType<typeof createNativeIssuer>>;
type ConfiguredOidc = Awaited<ReturnType<typeof createConfiguredOidc>>;
type Verifier = NonNullable<ConfiguredOidc["backchannelLogout"]>;
type Claims = Parameters<Issuer["logoutToken"]>[0];

const test = base.extend<{ issuer: Issuer; root: ServerTestHarness; verifier: Verifier }>({
  issuer: async ({}, use) => {
    await use(await createNativeIssuer());
  },
  root: async ({ issuer }, use) => {
    await using root = await createServerHarness({
      networkExecution: {
        resolver: (hostname) =>
          hostname === new URL(ISSUER).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted OIDC address resolution")),
        fetch: issuer.fetch,
      },
    });
    await use(root);
  },
  verifier: async ({ root }, use) => {
    await using oidc = await createConfiguredOidc({
      db: databaseHandle(root.db),
      built: root.app,
      now: root.clock.now,
      settings: NATIVE_OIDC_SETTINGS,
      scheduleInterval: root.timers.interval,
    });
    if (oidc.backchannelLogout === undefined) {
      throw new Error("the actual configured OIDC owner omitted enabled logout verification");
    }
    await use(oidc.backchannelLogout);
  },
});

function token(issuer: Issuer, claims: Claims = {}, omittedClaims: readonly string[] = []): Promise<string> {
  return issuer.logoutToken({ sub: SUBJECT, events: { [BACKCHANNEL_EVENT]: {} }, ...claims }, omittedClaims);
}

test("a valid logout token returns the actual sub", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toEqual({ sub: SUBJECT, sid: null });
});

test("a sid-only token validates separately from the route's supported revocation subjects", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer, { sid: "sess-1" }, ["sub"]), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toEqual({
    sub: null,
    sid: "sess-1",
  });
});

test("a wrong-issuer logout token returns null", async ({ issuer, verifier }) => {
  expect(
    await verifier.verify({ logoutToken: await token(issuer, { iss: "https://evil.example" }), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID }),
  ).toBeNull();
});

test("a wrong-audience logout token returns null", async ({ issuer, verifier }) => {
  expect(
    await verifier.verify({ logoutToken: await token(issuer, { aud: "some-other-client" }), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID }),
  ).toBeNull();
});

test("a logout token signed by a different key returns null", async ({ verifier }) => {
  const other = await createNativeIssuer();
  expect(await verifier.verify({ logoutToken: await token(other), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test("a logout token missing the backchannel event returns null", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer, {}, ["events"]), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test("a logout token carrying a nonce is refused as an ID-token replay", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer, { nonce: "n-123" }), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test("a logout token with neither sub nor sid returns null", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer, {}, ["sub"]), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test("a logout token missing iat returns null", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer, {}, ["iat"]), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test("a garbage logout token returns null without throwing", async ({ verifier }) => {
  expect(await verifier.verify({ logoutToken: "not.a.jwt", jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test("an unbuildable logout JWKS returns null", async ({ issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer), jwks: "{not json", issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});

test.for(["jti", "exp"])("a native logout token deliberately missing required %s returns null", async (claim, { issuer, verifier }) => {
  expect(await verifier.verify({ logoutToken: await token(issuer, {}, [claim]), jwks: KEY_URL, issuer: ISSUER, audience: CLIENT_ID })).toBeNull();
});
