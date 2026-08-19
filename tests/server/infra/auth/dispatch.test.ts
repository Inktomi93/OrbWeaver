import { MODE_RESOLVERS, ownerFallbackAllowed } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { makeAuthConfig as cfg, headers } from "./_support.ts";

// The dispatch seam: the `MODE_RESOLVERS` Record (one entry per AUTH_MODE — invariant #4) + the
// peer-gated owner-fallback predicate (#298 f2 — the raw TCP peer, not the `Host` header). Each resolver
// yields a pre-row `ResolvedIdentity | null` (NO userId/role).

describe("MODE_RESOLVERS — exhaustive over AUTH_MODE", () => {
  test("has exactly the four modes (a 5th would fail tsc on the mapped-type Record)", () => {
    expect(Object.keys(MODE_RESOLVERS).sort()).toEqual(["forward-header", "local", "oidc", "single-user"]);
  });

  test("single-user resolves to null (delegates to the unconditional owner fallback)", async () => {
    expect(await MODE_RESOLVERS["single-user"](headers(), cfg(), {})).toBeNull();
  });

  test("cookie modes resolve to null at infra (the seam owns the cookie read — D40)", async () => {
    expect(await MODE_RESOLVERS.local(headers({ cookie: "__Host-orb_session=t" }), cfg(), {})).toBeNull();
    expect(await MODE_RESOLVERS.oidc(headers(), cfg(), {})).toBeNull();
  });

  test("forward-header returns a pre-row identity from a trusted PEER (in the declared range)", async () => {
    const res = await MODE_RESOLVERS["forward-header"](
      headers({ "x-authentik-username": "alice" }),
      cfg({ mode: "forward-header", forwardTrustedProxies: ["10.0.0.0/8"] }),
      { peerIp: "10.1.2.3" },
    );
    expect(res).toEqual({ externalId: null, handle: "alice", groups: [], email: null });
  });

  test("forward-header unsigned path is FAIL-CLOSED when FORWARD_AUTH_TRUSTED_PROXIES is unset (B1)", async () => {
    const res = await MODE_RESOLVERS["forward-header"](headers({ "x-authentik-username": "alice" }), cfg({ mode: "forward-header" }), {});
    expect(res).toBeNull();
  });
});

describe("ownerFallbackAllowed — gates on the raw TCP peer, ONE rule for every mode (#298 f2)", () => {
  test("a loopback IPv4 peer is allowed", () => {
    expect(ownerFallbackAllowed("127.0.0.1")).toBe(true);
  });

  test("a loopback IPv6 peer (::1) is allowed", () => {
    expect(ownerFallbackAllowed("::1")).toBe(true);
  });

  test("an IPv4-mapped loopback peer (::ffff:127.0.0.1) is allowed", () => {
    expect(ownerFallbackAllowed("::ffff:127.0.0.1")).toBe(true);
  });

  test("a NON-loopback peer is denied — the headline: a private-but-LAN address is not loopback", () => {
    // 10/8, 192.168/16 and the docker bridge are all denied — a LAN device or a proxy hop must authenticate.
    expect(ownerFallbackAllowed("10.9.9.9")).toBe(false);
    expect(ownerFallbackAllowed("192.168.1.27")).toBe(false);
    expect(ownerFallbackAllowed("172.18.0.1")).toBe(false);
    expect(ownerFallbackAllowed("203.0.113.9")).toBe(false);
  });

  test("an absent peer fails closed (the seam's isAdmin threads none)", () => {
    expect(ownerFallbackAllowed(undefined)).toBe(false);
  });
});
