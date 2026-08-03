import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthConfig, ForwardJwtClaims, ForwardJwtVerifier, ResolveDeps } from "@orb/server/infra/auth";
import { MODE_RESOLVERS } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

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
// The unsigned path is FAIL-CLOSED unless a trusted-proxy source range is declared; the parsing tests run
// with an in-range TCP PEER (10/8) so they exercise the accepted (non-rejected) path. The trust subject is
// the SOCKET PEER (`deps.peerIp`) — an attacker-controlled X-Forwarded-For/X-Real-IP can NEVER grant it.
const TRUSTED = { forwardTrustedProxies: ["10.0.0.0/8"] };
const PEER_TRUSTED: ResolveDeps = { peerIp: "10.1.2.3" };

describe("forward-header — unsigned network-trust (through a declared trusted proxy)", () => {
  test("authentik family: username + uid + pipe-joined groups", async () => {
    const res = await resolveForwardHeader(
      headers({
        "x-authentik-username": "alice",
        "x-authentik-uid": "sub-alice",
        "x-authentik-groups": "staff|admins",
      }),
      cfg(TRUSTED),
      PEER_TRUSTED,
    );
    expect(res).toEqual({
      externalId: "sub-alice",
      handle: "alice",
      groups: ["staff", "admins"],
      // authentik family reads x-authentik-email when present (none here → null).
      email: null,
    });
  });

  test("authentik family reads x-authentik-email into the mutable email attribute", async () => {
    const res = await resolveForwardHeader(headers({ "x-authentik-username": "alice", "x-authentik-email": "alice@example.com" }), cfg(TRUSTED), PEER_TRUSTED);
    expect(res?.email).toBe("alice@example.com");
  });

  test("authelia family: remote-user (no stable uid → externalId null) + comma groups", async () => {
    const res = await resolveForwardHeader(headers({ "remote-user": "bob", "remote-groups": "x,y" }), cfg(TRUSTED), PEER_TRUSTED);
    expect(res).toEqual({ externalId: null, handle: "bob", groups: ["x", "y"], email: null });
  });

  test("generic X-Forwarded-User (oauth2-proxy/Traefik/nginx) is first-class in the fallback", async () => {
    const res = await resolveForwardHeader(headers({ "x-forwarded-user": "dave", "x-forwarded-groups": "eng,ops" }), cfg(TRUSTED), PEER_TRUSTED);
    expect(res).toEqual({ externalId: null, handle: "dave", groups: ["eng", "ops"], email: null });
  });

  test("a custom-named proxy header is honored (incl. the configured email header)", async () => {
    const res = await resolveForwardHeader(
      headers({ "x-user": "carol", "x-uid": "sub-carol", "x-email": "carol@example.com" }),
      cfg({
        ...TRUSTED,
        forwardUserHeader: "x-user",
        forwardUidHeader: "x-uid",
        forwardEmailHeader: "x-email",
      }),
      PEER_TRUSTED,
    );
    expect(res).toEqual({
      externalId: "sub-carol",
      handle: "carol",
      groups: [],
      email: "carol@example.com",
    });
  });

  test("no known user header → null", async () => {
    expect(await resolveForwardHeader(headers({ "x-other": "z" }), cfg(TRUSTED), PEER_TRUSTED)).toBeNull();
  });
});

describe("forward-header — unsigned path is FAIL-CLOSED by default (B1)", () => {
  test("EMPTY FORWARD_AUTH_TRUSTED_PROXIES → a spoofed Remote-User: owner is REJECTED", async () => {
    // The exact attack: any client that reaches the app socket sends a raw trusted header. With no signed
    // JWT and no declared trusted source, this MUST NOT become the owner — even from a trusted-looking peer.
    const res = await resolveForwardHeader(headers({ "remote-user": "owner", "remote-groups": "owners" }), cfg(), PEER_TRUSTED);
    expect(res).toBeNull();
  });

  test("EMPTY allowlist rejects even a loopback peer (no default trust)", async () => {
    const res = await resolveForwardHeader(headers({ "x-authentik-username": "owner" }), cfg(), {
      peerIp: "127.0.0.1",
    });
    expect(res).toBeNull();
  });
});

describe("forward-header — PEER-IP gate (once the allowlist is set)", () => {
  test("an out-of-range PEER IP is rejected → null", async () => {
    const res = await resolveForwardHeader(headers({ "x-authentik-username": "alice" }), cfg(TRUSTED), { peerIp: "1.2.3.4" });
    expect(res).toBeNull();
  });

  test("a MISSING PEER IP is rejected → null (unverifiable source)", async () => {
    const res = await resolveForwardHeader(headers({ "x-authentik-username": "alice" }), cfg(TRUSTED), {});
    expect(res).toBeNull();
  });

  test("an in-range PEER IP passes → identity", async () => {
    const res = await resolveForwardHeader(headers({ "x-authentik-username": "alice" }), cfg(TRUSTED), PEER_TRUSTED);
    expect(res?.handle).toBe("alice");
  });

  test("B1 anti-spoof: a forged X-Forwarded-For/X-Real-IP claiming a trusted IP from an UNTRUSTED peer is REJECTED", async () => {
    // The exact spoof PART 1 fixes: a direct-socket attacker (peer 203.0.113.9, off-allowlist) forges an
    // XFF/X-Real-IP that names an in-range 10/8 hop AND a Remote-User: owner. The pre-fix code trusted the
    // leftmost XFF and would mint owner; the PEER-IP gate rejects because the SOCKET peer is off-allowlist.
    const res = await resolveForwardHeader(
      headers({
        "x-authentik-username": "owner",
        "x-forwarded-for": "10.1.2.3",
        "x-real-ip": "10.0.0.1",
      }),
      cfg(TRUSTED),
      { peerIp: "203.0.113.9" },
    );
    expect(res).toBeNull();
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
      verifyDeps({ handle: castId<Handle>("x"), externalId: null, groups: [], email: null }),
    );
    expect(res).toBeNull();
  });

  test("(2) verify on but an EMPTY JWKS allowlist → null", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: [] }),
      verifyDeps({ handle: castId<Handle>("x"), externalId: null, groups: [], email: null }),
    );
    expect(res).toBeNull();
  });

  test("verify on + allowlist set but NO verifier injected → null", async () => {
    const res = await resolveForwardHeader(headers(SIGNED), cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }), {});
    expect(res).toBeNull();
  });

  test("(3)/(5) the verifier returns null (bad JWKS / failed verify) → null", async () => {
    const res = await resolveForwardHeader(headers(SIGNED), cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }), verifyDeps(null));
    expect(res).toBeNull();
  });

  test("(4) verified but no preferred_username → null", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      verifyDeps({ handle: undefined, externalId: castId<ExternalId>("sub"), groups: [], email: null }),
    );
    expect(res).toBeNull();
  });

  test("a verified JWT with a username → identity from the claims", async () => {
    const res = await resolveForwardHeader(
      headers(SIGNED),
      cfg({ verifyForwardJwt: true, jwksAllowlist: ["idp.example.com"] }),
      verifyDeps({ handle: castId<Handle>("alice"), externalId: castId<ExternalId>("sub-a"), groups: ["g"], email: "a@example.com" }),
    );
    expect(res).toEqual({
      externalId: castId<ExternalId>("sub-a"),
      handle: "alice",
      groups: ["g"],
      email: "a@example.com",
    });
  });
});
