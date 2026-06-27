import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  AuthConfig,
  ForwardJwtClaims,
  ForwardJwtVerifier,
  ResolveDeps,
} from "@orb/server/infra/auth";
import { dispatchMode } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// forward-header — the UNSIGNED header-trust path + the SIGNED JWT path's fail-closed framing (the jose
// crypto is the injected `verifyForwardJwt` port; here a fake verifier exercises the policy). Driven
// through the exported `dispatchMode` so accept→identity / reject→none is directly observable.

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "forward-header",
    fallback: "deny",
    defaultHandle: "owner",
    ownerHandles: ["owner"],
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...over,
  };
}

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    upsertUser: () =>
      Promise.resolve({ userId: castId<UserId>("u"), role: "user" as const, enabled: true }),
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
    const out = await dispatchMode(
      headers({
        "x-authentik-username": "alice",
        "x-authentik-uid": "sub-alice",
        "x-authentik-groups": "staff|admins",
      }),
      cfg(),
      deps(),
    );
    expect(out).toEqual({
      kind: "identity",
      identity: { externalId: "sub-alice", handle: "alice", groups: ["staff", "admins"] },
    });
  });

  test("authelia family: remote-user (no stable uid → externalId null) + comma groups", async () => {
    const out = await dispatchMode(
      headers({ "remote-user": "bob", "remote-groups": "x,y" }),
      cfg(),
      deps(),
    );
    expect(out).toEqual({
      kind: "identity",
      identity: { externalId: null, handle: "bob", groups: ["x", "y"] },
    });
  });

  test("a custom-named proxy header is honored", async () => {
    const out = await dispatchMode(
      headers({ "x-user": "carol", "x-uid": "sub-carol" }),
      cfg({ forwardUserHeader: "x-user", forwardUidHeader: "x-uid" }),
      deps(),
    );
    expect(out).toEqual({
      kind: "identity",
      identity: { externalId: "sub-carol", handle: "carol", groups: [] },
    });
  });

  test("no known user header → none", async () => {
    expect(await dispatchMode(headers({ "x-other": "z" }), cfg(), deps())).toEqual({
      kind: "none",
    });
  });
});

describe("forward-header — opt-in source-IP gate", () => {
  test("an out-of-range client IP is rejected → none", async () => {
    const out = await dispatchMode(
      headers({ "x-authentik-username": "alice", "x-forwarded-for": "1.2.3.4" }),
      cfg({ forwardTrustedProxies: ["10.0.0.0/8"] }),
      deps(),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("an in-range client IP passes → identity", async () => {
    const out = await dispatchMode(
      headers({ "x-authentik-username": "alice", "x-forwarded-for": "10.1.2.3" }),
      cfg({ forwardTrustedProxies: ["10.0.0.0/8"] }),
      deps(),
    );
    expect(out.kind).toBe("identity");
  });
});

describe("forward-header — signed JWT (fail-closed)", () => {
  test("(1) JWT present but no JWKS → rejected (none), no fall-through to the unsigned header", async () => {
    const out = await dispatchMode(
      headers({ "x-authentik-jwt": "aaa.bbb.ccc", "x-authentik-username": "spoofed" }),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      deps({ verifyForwardJwt: fakeVerifier({ handle: "x", externalId: null, groups: [] }) }),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("(2) verify on but an EMPTY JWKS allowlist → rejected (none)", async () => {
    const out = await dispatchMode(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: [] }),
      deps({ verifyForwardJwt: fakeVerifier({ handle: "x", externalId: null, groups: [] }) }),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("verify on + allowlist set but NO verifier injected → rejected (none)", async () => {
    const out = await dispatchMode(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      deps(),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("(3)/(5) the verifier returns null (bad JWKS / failed verify) → rejected (none)", async () => {
    const out = await dispatchMode(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      deps({ verifyForwardJwt: fakeVerifier(null) }),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("(4) verified but no preferred_username → rejected (none)", async () => {
    const out = await dispatchMode(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      deps({
        verifyForwardJwt: fakeVerifier({ handle: undefined, externalId: "sub", groups: [] }),
      }),
    );
    expect(out).toEqual({ kind: "none" });
  });

  test("a verified JWT with a username → identity from the claims", async () => {
    const out = await dispatchMode(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      deps({
        verifyForwardJwt: fakeVerifier({ handle: "alice", externalId: "sub-a", groups: ["g"] }),
      }),
    );
    expect(out).toEqual({
      kind: "identity",
      identity: { externalId: "sub-a", handle: "alice", groups: ["g"] },
    });
  });
});
