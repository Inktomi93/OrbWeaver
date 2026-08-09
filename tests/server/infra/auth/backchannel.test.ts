import { createBackchannelLogoutVerifier, resetJwksCache } from "@orb/server/infra/auth";
import type { CryptoKey } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// A5 — the OIDC Back-Channel Logout `logout_token` VERIFY surface (infra/auth/backchannel). Exercises the
// REAL jose crypto against a locally-signed token + its public JWKS literal (jwksFor's `{…}` path builds a
// local set), covering the full OIDC BCL §2.4 checklist: signature, issuer, audience, iat, the
// backchannel-logout EVENT, the nonce-MUST-NOT-be-present rule, and the sub-or-sid requirement.

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const ISSUER = "https://idp.example";
const AUDIENCE = "orb-client";

interface KeyMaterial {
  readonly privateKey: CryptoKey;
  readonly jwks: string;
}

async function makeKeyMaterial(): Promise<KeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "bcl-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwks: JSON.stringify({ keys: [jwk] }) };
}

/** A well-formed logout_token by default; `over` mutates the claims/header for the negative cases. */
function signLogoutToken(
  privateKey: CryptoKey,
  over: {
    iss?: string;
    aud?: string;
    claims?: Record<string, unknown>;
    withoutEvent?: boolean;
    withoutIat?: boolean;
  } = {},
): Promise<string> {
  const claims: Record<string, unknown> = {
    sub: "authentik|alice",
    ...(over.withoutEvent === true ? {} : { events: { [BACKCHANNEL_EVENT]: {} } }),
    ...over.claims,
  };
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "bcl-key" })
    .setIssuer(over.iss ?? ISSUER)
    .setAudience(over.aud ?? AUDIENCE);
  if (over.withoutIat !== true) {
    jwt.setIssuedAt();
  }
  jwt.setExpirationTime("2m");
  return jwt.sign(privateKey);
}

let km: KeyMaterial;
const verifier = createBackchannelLogoutVerifier();

beforeEach(async () => {
  resetJwksCache();
  km = await makeKeyMaterial();
});

describe("backchannel logout_token — accepts a well-formed token", () => {
  test("valid token → { sub } (the subject we revoke by)", async () => {
    const token = await signLogoutToken(km.privateKey);
    const subject = await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE });
    expect(subject).toEqual({ sub: "authentik|alice", sid: null });
  });

  test("a sid-only token (no sub) still validates → { sub: null, sid }", async () => {
    const token = await signLogoutToken(km.privateKey, { claims: { sub: undefined, sid: "sess-1" } });
    const subject = await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE });
    expect(subject).toEqual({ sub: null, sid: "sess-1" });
  });
});

describe("backchannel logout_token — fail-closed (returns null) on every §2.4 violation", () => {
  test("a WRONG-issuer token → null", async () => {
    const token = await signLogoutToken(km.privateKey, { iss: "https://evil.example" });
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a WRONG-audience token → null", async () => {
    const token = await signLogoutToken(km.privateKey, { aud: "some-other-client" });
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a token signed by a DIFFERENT key → null (bad signature)", async () => {
    const other = await makeKeyMaterial();
    const token = await signLogoutToken(other.privateKey);
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a token MISSING the backchannel-logout event → null", async () => {
    const token = await signLogoutToken(km.privateKey, { withoutEvent: true });
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a token carrying a NONCE → null (an ID token replayed as a logout token)", async () => {
    const token = await signLogoutToken(km.privateKey, { claims: { nonce: "n-123" } });
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a token with NEITHER sub NOR sid → null", async () => {
    const token = await signLogoutToken(km.privateKey, { claims: { sub: undefined } });
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a token MISSING iat → null", async () => {
    const token = await signLogoutToken(km.privateKey, { withoutIat: true });
    expect(await verifier.verify({ logoutToken: token, jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("a garbage token → null (not a crash)", async () => {
    expect(await verifier.verify({ logoutToken: "not.a.jwt", jwks: km.jwks, issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });

  test("an unbuildable JWKS (bad JSON) → null", async () => {
    const token = await signLogoutToken(km.privateKey);
    expect(await verifier.verify({ logoutToken: token, jwks: "{not json", issuer: ISSUER, audience: AUDIENCE })).toBeNull();
  });
});
