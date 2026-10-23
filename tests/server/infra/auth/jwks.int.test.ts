// Native JOSE verification and bounded key retrieval run through the actual composed server capability.
// @subject packages/server/src/infra/auth/jwks.ts
import { test as base, expect } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CLIENT_ID, createNativeIssuer, ISSUER } from "@orb/testkit/node/helpers";
import type { JWTPayload } from "jose";

const ALLOW = [new URL(ISSUER).hostname];
const KEY_URL = new URL("jwks", ISSUER).href;
const AUDIENCE = CLIENT_ID;
const CACHE_CAP = 32;

type Issuer = Awaited<ReturnType<typeof createNativeIssuer>>;
type Verifier = ServerTestHarness["app"]["forwardJwtVerifier"];

const test = base.extend<{ issuer: Issuer; jwks: string; root: ServerTestHarness; verifier: Verifier }>({
  issuer: async ({}, use) => {
    await use(await createNativeIssuer());
  },
  jwks: async ({ issuer }, use) => {
    await use(await (await issuer.fetch(KEY_URL)).text());
  },
  root: async ({ issuer }, use) => {
    await using root = await createServerHarness({
      networkExecution: {
        resolver: (hostname) => (hostname === ALLOW[0] ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted JWKS address resolution"))),
        fetch: issuer.fetch,
      },
    });
    await use(root);
  },
  verifier: async ({ root }, use) => {
    await use(root.app.forwardJwtVerifier);
  },
});

// biome-ignore lint/style/useNamingConvention: preferred_username is a native signed OIDC claim.
const DEFAULT_CLAIMS: JWTPayload = { preferred_username: "alice", sub: "sub-alice" };

function sign(issuer: Issuer, claims: JWTPayload = DEFAULT_CLAIMS): Promise<string> {
  return issuer.signedToken(claims);
}

test("a JWKS JSON literal verifies without outbound retrieval", async ({ verifier, issuer, jwks }) => {
  issuer.calls.length = 0;
  expect((await verifier.verify({ jwt: await sign(issuer), metaJwks: jwks, allowlist: ALLOW }))?.handle).toBe("alice");
  expect(issuer.calls).toEqual([]);
});

test("bad JSON literal refuses before outbound retrieval", async ({ verifier, issuer }) => {
  expect(await verifier.verify({ jwt: await sign(issuer), metaJwks: "{ not json", allowlist: ALLOW })).toBeNull();
  expect(issuer.calls).toEqual([]);
});

test("a non-https JWKS URL refuses before retrieval", async ({ verifier, issuer }) => {
  expect(await verifier.verify({ jwt: await sign(issuer), metaJwks: KEY_URL.replace("https:", "http:"), allowlist: ALLOW })).toBeNull();
  expect(issuer.calls).toEqual([]);
});

test("an off-allowlist https JWKS URL refuses before retrieval", async ({ verifier, issuer }) => {
  expect(await verifier.verify({ jwt: await sign(issuer), metaJwks: "https://evil.example.net/jwks", allowlist: ALLOW })).toBeNull();
  expect(issuer.calls).toEqual([]);
});

test("an allowed https JWKS URL retrieves native keys only when verification demands them", async ({ verifier, issuer }) => {
  expect(issuer.calls).toEqual([]);
  expect((await verifier.verify({ jwt: await sign(issuer), metaJwks: KEY_URL, allowlist: ALLOW }))?.handle).toBe("alice");
  expect(issuer.calls).toEqual(["GET /jwks"]);
});

test("an empty reader allowlist keeps literal and https admission independent of the signed-request gate", async ({ verifier, issuer, jwks }) => {
  const jwt = await sign(issuer);
  issuer.calls.length = 0;
  expect((await verifier.verify({ jwt, metaJwks: jwks, allowlist: [] }))?.handle).toBe("alice");
  expect(issuer.calls).toEqual([]);
  expect((await verifier.verify({ jwt, metaJwks: KEY_URL, allowlist: [] }))?.handle).toBe("alice");
  expect(issuer.calls).toEqual(["GET /jwks"]);
});

test("the sha256-keyed cache reuses identical sources without merging distinct remote key sets", async ({ verifier, issuer }) => {
  const jwt = await sign(issuer);
  for (const metaJwks of [KEY_URL, KEY_URL, `${KEY_URL}?distinct=1`, KEY_URL]) {
    expect((await verifier.verify({ jwt, metaJwks, allowlist: ALLOW }))?.handle).toBe("alice");
  }
  expect(issuer.calls).toEqual(["GET /jwks", "GET /jwks"]);
});

test("the LRU retains exactly 32 native sets and access promotes the held key before eviction", async ({ verifier, issuer }) => {
  const jwt = await sign(issuer);
  const verify = async (index: number): Promise<void> => {
    expect((await verifier.verify({ jwt, metaJwks: `${KEY_URL}?key=${String(index)}`, allowlist: ALLOW }))?.handle).toBe("alice");
  };
  for (let index = 0; index < CACHE_CAP; index += 1) {
    await verify(index);
  }
  expect(issuer.calls).toHaveLength(CACHE_CAP);
  await verify(0);
  expect(issuer.calls).toHaveLength(CACHE_CAP);
  await verify(CACHE_CAP);
  expect(issuer.calls).toHaveLength(CACHE_CAP + 1);
  await verify(0);
  expect(issuer.calls).toHaveLength(CACHE_CAP + 1);
  await verify(1);
  expect(issuer.calls).toHaveLength(CACHE_CAP + 2);
});

test("a validly signed JWT returns the mapped claims", async ({ verifier, issuer, jwks }) => {
  // biome-ignore lint/style/useNamingConvention: preferred_username is the native signed issuer claim.
  const jwt = await sign(issuer, { preferred_username: "alice", sub: "sub-a", groups: ["staff"], email: "a@example.com" });
  expect(await verifier.verify({ jwt, metaJwks: jwks, allowlist: ALLOW })).toEqual({
    handle: "alice",
    externalId: "sub-a",
    groups: ["staff"],
    email: "a@example.com",
  });
});

test("a tampered signature returns null", async ({ verifier, issuer, jwks }) => {
  const parts = (await sign(issuer)).split(".");
  const signature = parts[2] ?? "";
  parts[2] = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  expect(await verifier.verify({ jwt: parts.join("."), metaJwks: jwks, allowlist: ALLOW })).toBeNull();
});

test("a JWT signed by a different key returns null", async ({ verifier, jwks }) => {
  const attacker = await createNativeIssuer();
  expect(await verifier.verify({ jwt: await sign(attacker), metaJwks: jwks, allowlist: ALLOW })).toBeNull();
});

test("issuer mismatch returns null", async ({ verifier, issuer, jwks }) => {
  expect(
    await verifier.verify({
      jwt: await sign(issuer, { ...DEFAULT_CLAIMS, iss: "https://real-idp.example.com" }),
      metaJwks: jwks,
      allowlist: ALLOW,
      issuer: ISSUER,
    }),
  ).toBeNull();
});

test("issuer match verifies", async ({ verifier, issuer, jwks }) => {
  expect(
    (await verifier.verify({ jwt: await sign(issuer, { ...DEFAULT_CLAIMS, iss: ISSUER }), metaJwks: jwks, allowlist: ALLOW, issuer: ISSUER }))?.handle,
  ).toBe("alice");
});

test("audience mismatch returns null", async ({ verifier, issuer, jwks }) => {
  expect(
    await verifier.verify({ jwt: await sign(issuer, { ...DEFAULT_CLAIMS, aud: "some-other-client" }), metaJwks: jwks, allowlist: ALLOW, audience: AUDIENCE }),
  ).toBeNull();
});

test("audience match verifies", async ({ verifier, issuer, jwks }) => {
  expect(
    (await verifier.verify({ jwt: await sign(issuer, { ...DEFAULT_CLAIMS, aud: AUDIENCE }), metaJwks: jwks, allowlist: ALLOW, audience: AUDIENCE }))?.handle,
  ).toBe("alice");
});

test("an HS256 confusion token is rejected by the asymmetric algorithm pin", async ({ verifier, issuer, jwks }) => {
  const jwt = await issuer.signedToken(DEFAULT_CLAIMS, {
    header: { alg: "HS256" },
    signingKey: new TextEncoder().encode("shared-secret-not-a-real-key-1234"),
  });
  expect(await verifier.verify({ jwt, metaJwks: jwks, allowlist: ALLOW })).toBeNull();
});

test("bad metaJwks returns null before verification", async ({ verifier, issuer }) => {
  expect(await verifier.verify({ jwt: await sign(issuer), metaJwks: "{ not json", allowlist: ALLOW })).toBeNull();
});

test("an ES256 token verifies under the second pinned algorithm", async ({ verifier }) => {
  const issuer = await createNativeIssuer({ algorithm: "ES256" });
  const jwks = await (await issuer.fetch(new URL("jwks", ISSUER))).text();
  // biome-ignore lint/style/useNamingConvention: preferred_username is a native signed OIDC claim.
  const jwt = await issuer.signedToken({ preferred_username: "carol", sub: "sub-c" });
  expect((await verifier.verify({ jwt, metaJwks: jwks, allowlist: ALLOW }))?.handle).toBe("carol");
});

test("a verified token without preferred_username maps no handle", async ({ verifier, issuer, jwks }) => {
  expect(await verifier.verify({ jwt: await sign(issuer, { sub: "sub-only" }), metaJwks: jwks, allowlist: ALLOW })).toEqual({
    handle: undefined,
    externalId: "sub-only",
    groups: [],
    email: null,
  });
});
