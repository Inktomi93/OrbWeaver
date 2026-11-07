// Native JOSE verification runs through the actual composed server capability over the operator's key source.
// @subject packages/server/src/infra/auth/jwks.ts
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { test as base, expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CLIENT_ID, createNativeIssuer, ISSUER } from "@orb/testkit/node/helpers";
import type { JWTPayload } from "jose";

const KEY_HOST = new URL(ISSUER).hostname;
const KEY_URL = new URL("jwks", ISSUER).href;
const AUDIENCE = CLIENT_ID;

type Issuer = Awaited<ReturnType<typeof createNativeIssuer>>;
type Verifier = NonNullable<ServerTestHarness["app"]["forwardJwtVerifier"]>;

function rootOver(issuer: Issuer, source: string): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { ["FORWARD_AUTH_JWKS"]: source },
    networkExecution: {
      resolver: (hostname) =>
        hostname === KEY_HOST ? Promise.resolve([PUBLIC_PEER_ADDRESS]) : Promise.reject(new Error("unscripted JWKS address resolution")),
      fetch: issuer.fetch,
    },
  });
}

function verifierOf(root: ServerTestHarness): Verifier {
  const { forwardJwtVerifier } = root.app;
  if (forwardJwtVerifier === undefined) {
    throw new Error("a root with FORWARD_AUTH_JWKS composes a verifier");
  }
  return forwardJwtVerifier;
}

const test = base.extend<{ issuer: Issuer; root: ServerTestHarness; verifier: Verifier }>({
  issuer: async ({}, use) => {
    await use(await createNativeIssuer());
  },
  root: async ({ issuer }, use) => {
    await using root = await rootOver(issuer, await (await issuer.fetch(KEY_URL)).text());
    await use(root);
  },
  verifier: async ({ root }, use) => {
    await use(verifierOf(root));
  },
});

// biome-ignore lint/style/useNamingConvention: preferred_username is a native signed OIDC claim.
const DEFAULT_CLAIMS: JWTPayload = { iss: ISSUER, aud: AUDIENCE, preferred_username: "alice", sub: "sub-alice" };
const BINDING = { issuer: ISSUER, audience: AUDIENCE };

function sign(issuer: Issuer, claims: JWTPayload = DEFAULT_CLAIMS): Promise<string> {
  return issuer.signedToken(claims);
}

test("an operator JWKS literal verifies without outbound retrieval", async ({ verifier, issuer }) => {
  const jwt = await sign(issuer);
  issuer.calls.length = 0;
  expect((await verifier.verify({ jwt, ...BINDING }))?.handle).toBe("alice");
  expect(issuer.calls).toEqual([]);
});

test("an operator JWKS URL retrieves keys only when verification demands them, then reuses them", async ({ issuer }) => {
  await using root = await rootOver(issuer, KEY_URL);
  const verifier = verifierOf(root);
  const jwt = await sign(issuer);
  expect(issuer.calls).toEqual([]);
  expect((await verifier.verify({ jwt, ...BINDING }))?.handle).toBe("alice");
  expect((await verifier.verify({ jwt, ...BINDING }))?.handle).toBe("alice");
  expect(issuer.calls).toEqual(["GET /jwks"]);
});

test("a validly signed JWT returns the mapped claims", async ({ verifier, issuer }) => {
  const jwt = await sign(issuer, { ...DEFAULT_CLAIMS, sub: "sub-a", groups: ["staff"], email: "a@example.com" });
  expect(await verifier.verify({ jwt, ...BINDING })).toEqual({
    handle: "alice",
    externalId: "sub-a",
    groups: ["staff"],
    email: "a@example.com",
  });
});

test("a tampered signature returns null", async ({ verifier, issuer }) => {
  const parts = (await sign(issuer)).split(".");
  const signature = parts[2] ?? "";
  parts[2] = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  expect(await verifier.verify({ jwt: parts.join("."), ...BINDING })).toBeNull();
});

test("a JWT signed by a different key returns null", async ({ verifier }) => {
  const attacker = await createNativeIssuer();
  expect(await verifier.verify({ jwt: await sign(attacker), ...BINDING })).toBeNull();
});

test("issuer mismatch returns null", async ({ verifier, issuer }) => {
  expect(
    await verifier.verify({
      jwt: await sign(issuer, { ...DEFAULT_CLAIMS, iss: "https://real-idp.example.com" }),
      ...BINDING,
    }),
  ).toBeNull();
});

test("issuer match verifies", async ({ verifier, issuer }) => {
  expect((await verifier.verify({ jwt: await sign(issuer), ...BINDING }))?.handle).toBe("alice");
});

test("audience mismatch returns null", async ({ verifier, issuer }) => {
  expect(await verifier.verify({ jwt: await sign(issuer, { ...DEFAULT_CLAIMS, aud: "some-other-client" }), ...BINDING })).toBeNull();
});

test("audience match verifies", async ({ verifier, issuer }) => {
  expect((await verifier.verify({ jwt: await sign(issuer), ...BINDING }))?.handle).toBe("alice");
});

test("an HS256 confusion token is rejected by the asymmetric algorithm pin", async ({ verifier, issuer }) => {
  const jwt = await issuer.signedToken(DEFAULT_CLAIMS, {
    header: { alg: "HS256" },
    signingKey: new TextEncoder().encode("shared-secret-not-a-real-key-1234"),
  });
  expect(await verifier.verify({ jwt, ...BINDING })).toBeNull();
});

test("an ES256 token verifies under the second pinned algorithm", async () => {
  const issuer = await createNativeIssuer({ algorithm: "ES256" });
  await using root = await rootOver(issuer, await (await issuer.fetch(KEY_URL)).text());
  // biome-ignore lint/style/useNamingConvention: preferred_username is a native signed OIDC claim.
  const jwt = await issuer.signedToken({ iss: ISSUER, aud: AUDIENCE, preferred_username: "carol", sub: "sub-c" });
  expect((await verifierOf(root).verify({ jwt, ...BINDING }))?.handle).toBe("carol");
});

test("a verified token without preferred_username maps no handle", async ({ verifier, issuer }) => {
  expect(await verifier.verify({ jwt: await sign(issuer, { iss: ISSUER, aud: AUDIENCE, sub: "sub-only" }), ...BINDING })).toEqual({
    handle: undefined,
    externalId: "sub-only",
    groups: [],
    email: null,
  });
});
