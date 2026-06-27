import type {
  AuthConfig,
  ForwardJwtClaims,
  ForwardJwtVerifier,
  ResolveDeps,
} from "@orb/server/infra/auth";
import { MODE_RESOLVERS } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// forward-header — the UNSIGNED header-trust path + the SIGNED JWT path's fail-closed framing (the jose
// crypto is the injected `verifyForwardJwt` port; here a fake verifier exercises the policy). Driven
// through `MODE_RESOLVERS["forward-header"]` → a pre-row `ResolvedIdentity | null` (NO userId/role); a
// verified/trusted identity is the object, every rejection is null.

const resolveForwardHeader = MODE_RESOLVERS["forward-header"];

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "forward-header",
    fallback: "deny",
    defaultHandle: "owner",
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...over,
  };
}

function fakeVerifier(result: ForwardJwtClaims | null): ForwardJwtVerifier {
  return { verify: () => Promise.resolve(result) };
}

const headers = (init: Record<string, string>): Headers => new Headers(init);
const SIGNED = { "x-authentik-jwt": "aaa.bbb.ccc", "x-authentik-meta-jwks": "{}" };

describe("forward-header — unsigned network-trust", () => {
  test("authentik family: username + uid + pipe-joined groups", async () => {
    const res = await resolveForwardHeader(
      headers({
        "x-authentik-username": "alice",
        "x-authentik-uid": "sub-alice",
        "x-authentik-groups": "staff|admins",
      }),
      cfg(),
      {},
    );
    expect(res).toEqual({ externalId: "sub-alice", handle: "alice", groups: ["staff", "admins"] });
  });

  test("authelia family: remote-user (no stable uid → externalId null) + comma groups", async () => {
    const res = await resolveForwardHeader(
      headers({ "remote-user": "bob", "remote-groups": "x,y" }),
      cfg(),
      {},
    );
    expect(res).toEqual({ externalId: null, handle: "bob", groups: ["x", "y"] });
  });

  test("a custom-named proxy header is honored", async () => {
    const res = await resolveForwardHeader(
      headers({ "x-user": "carol", "x-uid": "sub-carol" }),
      cfg({ forwardUserHeader: "x-user", forwardUidHeader: "x-uid" }),
      {},
    );
    expect(res).toEqual({ externalId: "sub-carol", handle: "carol", groups: [] });
  });

  test("no known user header → null", async () => {
    expect(await resolveForwardHeader(headers({ "x-other": "z" }), cfg(), {})).toBeNull();
  });
});

describe("forward-header — opt-in source-IP gate", () => {
  test("an out-of-range client IP is rejected → null", async () => {
    const res = await resolveForwardHeader(
      headers({ "x-authentik-username": "alice", "x-forwarded-for": "1.2.3.4" }),
      cfg({ forwardTrustedProxies: ["10.0.0.0/8"] }),
      {},
    );
    expect(res).toBeNull();
  });

  test("an in-range client IP passes → identity", async () => {
    const res = await resolveForwardHeader(
      headers({ "x-authentik-username": "alice", "x-forwarded-for": "10.1.2.3" }),
      cfg({ forwardTrustedProxies: ["10.0.0.0/8"] }),
      {},
    );
    expect(res?.handle).toBe("alice");
  });
});

describe("forward-header — signed JWT (fail-closed)", () => {
  const verifyDeps = (claims: ForwardJwtClaims | null): ResolveDeps => ({
    verifyForwardJwt: fakeVerifier(claims),
  });

  test("(1) JWT present but no JWKS → null, no fall-through to the unsigned header", async () => {
    const res = await resolveForwardHeader(
      headers({ "x-authentik-jwt": "aaa.bbb.ccc", "x-authentik-username": "spoofed" }),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      verifyDeps({ handle: "x", externalId: null, groups: [] }),
    );
    expect(res).toBeNull();
  });

  test("(2) verify on but an EMPTY JWKS allowlist → null", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: [] }),
      verifyDeps({ handle: "x", externalId: null, groups: [] }),
    );
    expect(res).toBeNull();
  });

  test("verify on + allowlist set but NO verifier injected → null", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      {},
    );
    expect(res).toBeNull();
  });

  test("(3)/(5) the verifier returns null (bad JWKS / failed verify) → null", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      verifyDeps(null),
    );
    expect(res).toBeNull();
  });

  test("(4) verified but no preferred_username → null", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      verifyDeps({ handle: undefined, externalId: "sub", groups: [] }),
    );
    expect(res).toBeNull();
  });

  test("a verified JWT with a username → identity from the claims", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      verifyDeps({ handle: "alice", externalId: "sub-a", groups: ["g"] }),
    );
    expect(res).toEqual({ externalId: "sub-a", handle: "alice", groups: ["g"] });
  });
});
