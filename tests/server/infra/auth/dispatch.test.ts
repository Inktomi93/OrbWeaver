import type { AuthConfig } from "@orb/server/infra/auth";
import { isLocalOrigin, MODE_RESOLVERS, ownerFallbackAllowed } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// The dispatch seam: the `MODE_RESOLVERS` Record (one entry per AUTH_MODE — invariant #4) + the
// origin-gated owner-fallback predicate. Each resolver yields a pre-row `ResolvedIdentity | null`
// (NO userId/role).

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "single-user",
    fallback: "owner",
    defaultHandle: "owner",
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...over,
  };
}

const headers = (init: Record<string, string> = {}): Headers => new Headers(init);

describe("MODE_RESOLVERS — exhaustive over AUTH_MODE", () => {
  test("has exactly the four modes (a 5th would fail tsc on the mapped-type Record)", () => {
    expect(Object.keys(MODE_RESOLVERS).sort()).toEqual([
      "forward-header",
      "local",
      "oidc",
      "single-user",
    ]);
  });

  test("single-user resolves to null (delegates to the unconditional owner fallback)", async () => {
    expect(await MODE_RESOLVERS["single-user"](headers(), cfg(), {})).toBeNull();
  });

  test("cookie modes resolve to null at infra (the seam owns the cookie read — D40)", async () => {
    expect(
      await MODE_RESOLVERS.local(headers({ cookie: "__Host-orb_session=t" }), cfg(), {}),
    ).toBeNull();
    expect(await MODE_RESOLVERS.oidc(headers(), cfg(), {})).toBeNull();
  });

  test("forward-header returns a pre-row identity from a trusted header", async () => {
    const res = await MODE_RESOLVERS["forward-header"](
      headers({ "x-authentik-username": "alice" }),
      cfg({ mode: "forward-header" }),
      {},
    );
    expect(res).toEqual({ externalId: null, handle: "alice", groups: [] });
  });
});

describe("ownerFallbackAllowed", () => {
  test("single-user → always allowed (even on a public-looking host)", () => {
    expect(ownerFallbackAllowed(headers({ host: "chat.example.com" }), cfg())).toBe(true);
  });

  test("SSO mode → allowed only on a local origin", () => {
    expect(ownerFallbackAllowed(headers({ host: "localhost" }), cfg({ mode: "oidc" }))).toBe(true);
    expect(ownerFallbackAllowed(headers({ host: "chat.example.com" }), cfg({ mode: "oidc" }))).toBe(
      false,
    );
  });
});

describe("isLocalOrigin (reads Host, fails closed)", () => {
  test("localhost is local", () => {
    expect(isLocalOrigin(headers({ host: "localhost:8788" }), [])).toBe(true);
  });

  test("a loopback IP literal is local", () => {
    expect(isLocalOrigin(headers({ host: "127.0.0.1" }), [])).toBe(true);
  });

  test("a public FQDN is NOT local (SSO required)", () => {
    expect(isLocalOrigin(headers({ host: "chat.example.com" }), [])).toBe(false);
  });

  test("a configured trusted host is local", () => {
    expect(isLocalOrigin(headers({ host: "orb.lan" }), ["orb.lan"])).toBe(true);
  });

  test("a missing Host header fails closed (not local)", () => {
    expect(isLocalOrigin(headers(), [])).toBe(false);
  });
});
