import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthConfig, ResolveDeps } from "@orb/server/infra/auth";
import { resolve } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// VERIFICATION-only: `resolve(headers, deps)` → an `IdentityResolution` (the pre-row `ResolvedIdentity`
// + the seam's signals). It carries NO `userId` and NO `role` (invariant #3); it does NOT upsert and
// does NOT mint a `Principal`. The role decision (`determineRole`) + the upsert move to `domain/sessions`
// (4c); the `Principal` mint is `entry/auth/seam.ts` (4e) — that coverage lives there, NOT here.

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

describe("resolve — the verification output never carries userId or role (invariant #3)", () => {
  test("single-user → the owner-fallback identity, via:'fallback', NO userId/role", async () => {
    const res = await resolve(headers(), { config: cfg({ mode: "single-user" }) });
    expect(res.identity).toEqual({ externalId: null, handle: "owner", groups: [] });
    expect(res.via).toBe("fallback");
    expect(res.identity).not.toHaveProperty("userId");
    expect(res.identity).not.toHaveProperty("role");
  });

  test("a resolved cookie identity carries only {externalId, handle, groups}", async () => {
    const identity = {
      externalId: castId<ExternalId>("sub-alice"),
      handle: castId<Handle>("alice"),
      groups: ["staff"],
    };
    const deps: ResolveDeps = {
      config: cfg({ mode: "local" }),
      validateCookie: () => Promise.resolve(identity),
    };
    const res = await resolve(headers({ cookie: "__Host-orb_session=tok-abc" }), deps);
    expect(res.identity).toEqual(identity);
    expect(Object.keys(res.identity ?? {}).sort()).toEqual(["externalId", "groups", "handle"]);
  });
});

describe("resolve — owner fallback (the seam mints owner from via:'fallback')", () => {
  test("SSO mode: the owner fallback is REFUSED on a public origin → identity null", async () => {
    const res = await resolve(headers({ host: "chat.example.com" }), {
      config: cfg({ mode: "oidc" }),
      validateCookie: () => Promise.resolve(null),
    });
    expect(res.identity).toBeNull();
  });

  test("SSO mode: the owner fallback is GRANTED on a local origin → via:'fallback'", async () => {
    const res = await resolve(headers({ host: "localhost:8788" }), {
      config: cfg({ mode: "oidc" }),
      validateCookie: () => Promise.resolve(null),
    });
    expect(res.via).toBe("fallback");
    expect(res.identity?.handle).toBe("owner");
  });

  test("fallback 'deny' + no identity → identity null (SSO mandatory)", async () => {
    const res = await resolve(headers(), {
      config: cfg({ mode: "single-user", fallback: "deny" }),
    });
    expect(res.identity).toBeNull();
  });
});

describe("resolve — per-request signals", () => {
  test("a live cookie session → via:'cookie' + viaCookie true (cross-site surface)", async () => {
    const identity = { externalId: null, handle: castId<Handle>("alice"), groups: [] };
    const res = await resolve(headers({ cookie: "__Host-orb_session=tok" }), {
      config: cfg({ mode: "local" }),
      validateCookie: () => Promise.resolve(identity),
    });
    expect(res.via).toBe("cookie");
    expect(res.viaCookie).toBe(true);
  });

  test("a forward-header identity → via:'header' + viaCookie false (no cross-site surface)", async () => {
    const res = await resolve(headers({ "x-authentik-username": "alice" }), {
      config: cfg({ mode: "forward-header" }),
    });
    expect(res.via).toBe("header");
    expect(res.viaCookie).toBe(false);
  });

  test("the CSRF header signal is captured (the GATE is the seam's — invariant #9)", async () => {
    const withHeader = await resolve(headers({ host: "127.0.0.1", "x-orb-csrf": "1" }), {
      config: cfg({ mode: "single-user" }),
    });
    const without = await resolve(headers({ host: "127.0.0.1" }), {
      config: cfg({ mode: "single-user" }),
    });
    expect(withHeader.hasCsrfHeader).toBe(true);
    expect(without.hasCsrfHeader).toBe(false);
  });
});
