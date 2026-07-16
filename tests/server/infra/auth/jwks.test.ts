import { createForwardJwtVerifier, jwksCacheSize, jwksFor, resetJwksCache } from "@orb/server/infra/auth";
import type { CryptoKey } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

// OIDC/JWT claim names are wire-fixed snake_case (preferred_username, sub, aud, iss). Kept as-is in the
// test payloads — a camelCase rename would mint a JWT the verifier can't read.

// jwks.ts — the forward-header JWT/JWKS VERIFY surface (the injected `verifyForwardJwt` port). The
// dispatch/policy tests (modes/forward-header.test.ts) use a FAKE verifier; THIS file exercises the REAL
// jose crypto: jwksFor's fail-closed point (3) (bad-JSON / non-https / off-allowlist) + createForwardJwtVerifier's
// fail-closed point (5) (jwtVerify throws → null), plus the untested-until-now issuer-mismatch /
// audience-mismatch / alg-confusion rejections (test-quality-review §"untested area").

const ALLOW = ["idp.example.com"] as const;

interface KeyMaterial {
  readonly privateKey: CryptoKey;
  readonly jwks: string;
}

// A real RS256 keypair + its public JWKS literal. The `kid` lets jose pick the key; a signed JWT verifies
// against the exported public set.
async function makeKeyMaterial(): Promise<KeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwks: JSON.stringify({ keys: [jwk] }) };
}

// biome-ignore lint/style/useNamingConvention: OIDC claim names (preferred_username/sub) are wire-fixed snake_case.
const DEFAULT_CLAIMS: Record<string, unknown> = { preferred_username: "alice", sub: "sub-alice" };

function sign(privateKey: CryptoKey, over: { iss?: string; aud?: string; claims?: Record<string, unknown> } = {}): Promise<string> {
  const jwt = new SignJWT(over.claims ?? DEFAULT_CLAIMS).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuedAt().setExpirationTime("5m");
  if (over.iss !== undefined) {
    jwt.setIssuer(over.iss);
  }
  if (over.aud !== undefined) {
    jwt.setAudience(over.aud);
  }
  return jwt.sign(privateKey);
}

beforeEach(() => {
  resetJwksCache();
});

describe("jwksFor — fail-closed point (3)", () => {
  test("a JWKS JSON literal builds a key set", () => {
    expect(jwksFor('{"keys":[]}', ALLOW)).not.toBeNull();
  });

  test("bad JSON literal → null (parse)", () => {
    expect(jwksFor("{ not json", ALLOW)).toBeNull();
  });

  test("a non-https JWKS URL → null (would-be egress vector)", () => {
    expect(jwksFor("http://idp.example.com/jwks", ALLOW)).toBeNull();
  });

  test("an https URL whose host is OFF the allowlist → null", () => {
    expect(jwksFor("https://evil.example.net/jwks", ALLOW)).toBeNull();
  });

  test("an https URL ON the allowlist builds a (lazy) remote set", () => {
    expect(jwksFor("https://idp.example.com/jwks", ALLOW)).not.toBeNull();
  });

  test("an empty allowlist does NOT widen the URL path — the literal path is still allowlist-agnostic", () => {
    // Empty allowlist: a URL is accepted only when https (the resolver's caller — forward-header.ts —
    // refuses the signed path entirely on an empty allowlist, point 2; jwksFor itself only gates host when
    // the allowlist is non-empty). The literal path never consults the allowlist (not an egress vector).
    expect(jwksFor('{"keys":[]}', [])).not.toBeNull();
    expect(jwksFor("https://anything.example.org/jwks", [])).not.toBeNull();
  });

  test("the sha256-keyed LRU dedupes identical bodies and bounds churn", () => {
    resetJwksCache();
    jwksFor('{"keys":[]}', ALLOW);
    jwksFor('{"keys":[]}', ALLOW);
    expect(jwksCacheSize()).toBe(1);
    jwksFor('{"keys":[{"kid":"x"}]}', ALLOW);
    expect(jwksCacheSize()).toBe(2);
  });

  test("the LRU caps at 32 entries — a hostile upstream varying the header per request can't grow it unbounded", () => {
    resetJwksCache();
    const distinctJwksCount = 100;
    const lruCap = 32;
    for (let i = 0; i < distinctJwksCount; i += 1) {
      jwksFor(`{"keys":[{"kid":"k${i}"}]}`, ALLOW);
    }
    expect(jwksCacheSize()).toBe(lruCap);
  });
});

describe("createForwardJwtVerifier — real jose verification (fail-closed point 5)", () => {
  test("a validly-signed JWT → the mapped claims", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    // biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case.
    const jwt = await sign(privateKey, { claims: { preferred_username: "alice", sub: "sub-a", groups: ["staff"], email: "a@example.com" } });
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW });
    expect(claims).toEqual({ handle: "alice", externalId: "sub-a", groups: ["staff"], email: "a@example.com" });
  });

  test("a TAMPERED signature → null (verify throws, caught)", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    const jwt = await sign(privateKey);
    // Corrupt the FIRST char of the signature segment, not the last: base64url packs 6 bits/char, so a
    // 64-byte (512-bit) ES256 signature's trailing char carries 4 padding bits — flipping it can leave the
    // decoded bytes unchanged (a flaky "tamper" that still verifies). The first char's 6 bits are all
    // significant (byte 0 of the signature), so any change always invalidates it.
    const parts = jwt.split(".");
    const sig = parts[2] ?? "";
    parts[2] = `${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
    const tampered = parts.join(".");
    expect(await createForwardJwtVerifier().verify({ jwt: tampered, metaJwks: jwks, allowlist: ALLOW })).toBeNull();
  });

  test("a JWT signed by a DIFFERENT key (not in the JWKS) → null", async () => {
    const attacker = await makeKeyMaterial();
    const victim = await makeKeyMaterial();
    const jwt = await sign(attacker.privateKey);
    // The metaJwks is the VICTIM's public set — the attacker's signature can't verify against it.
    expect(await createForwardJwtVerifier().verify({ jwt, metaJwks: victim.jwks, allowlist: ALLOW })).toBeNull();
  });

  test("issuer MISMATCH → null (jwtVerify enforces the configured issuer)", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    const jwt = await sign(privateKey, { iss: "https://real-idp.example.com" });
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW, issuer: "https://expected-idp.example.com" });
    expect(claims).toBeNull();
  });

  test("issuer MATCH → verified", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    const jwt = await sign(privateKey, { iss: "https://idp.example.com" });
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW, issuer: "https://idp.example.com" });
    expect(claims?.handle).toBe("alice");
  });

  test("audience MISMATCH → null", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    const jwt = await sign(privateKey, { aud: "some-other-client" });
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW, audience: "orbweaver" });
    expect(claims).toBeNull();
  });

  test("audience MATCH → verified", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    const jwt = await sign(privateKey, { aud: "orbweaver" });
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW, audience: "orbweaver" });
    expect(claims?.handle).toBe("alice");
  });

  test("alg-confusion: an HS256-signed token is REJECTED (not on the RS256/ES256 pin)", async () => {
    const { jwks } = await makeKeyMaterial();
    // Sign with a symmetric secret + alg:HS256 — the classic confusion attack (verify the RSA public key
    // material as an HMAC secret). The pinned allowlist refuses HS256 outright.
    const secret = new TextEncoder().encode("shared-secret-not-a-real-key-1234");
    // biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case.
    const hsJwt = await new SignJWT({ preferred_username: "attacker", sub: "evil" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);
    expect(await createForwardJwtVerifier().verify({ jwt: hsJwt, metaJwks: jwks, allowlist: ALLOW })).toBeNull();
  });

  test("bad metaJwks (jwksFor nulls) → verifier returns null before any verify", async () => {
    const { privateKey } = await makeKeyMaterial();
    const jwt = await sign(privateKey);
    expect(await createForwardJwtVerifier().verify({ jwt, metaJwks: "{ not json", allowlist: ALLOW })).toBeNull();
  });

  test("an ES256 token verifies (the second pinned alg)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = await exportJWK(publicKey);
    jwk.kid = "ec-key";
    jwk.alg = "ES256";
    const jwks = JSON.stringify({ keys: [jwk] });
    // biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case.
    const jwt = await new SignJWT({ preferred_username: "carol", sub: "sub-c" })
      .setProtectedHeader({ alg: "ES256", kid: "ec-key" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW });
    expect(claims?.handle).toBe("carol");
  });

  test("a verified token WITHOUT preferred_username maps handle:undefined (the seam's point 4 rejects it)", async () => {
    const { privateKey, jwks } = await makeKeyMaterial();
    const jwt = await sign(privateKey, { claims: { sub: "sub-only" } });
    const claims = await createForwardJwtVerifier().verify({ jwt, metaJwks: jwks, allowlist: ALLOW });
    expect(claims).toEqual({ handle: undefined, externalId: "sub-only", groups: [], email: null });
  });
});
