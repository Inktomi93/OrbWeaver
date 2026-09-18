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

// ── THE WIDENED PEER SET (`AUTH_FALLBACK_TRUSTED_PEERS`, PROPOSED — owner fork, spec §3.1 arm (b)) ────────
// The second parameter is the operator's opt-in CIDR list. UNSET/EMPTY ⇒ byte-identical to the loopback-only
// rule above; SET ⇒ a peer inside a listed range is admitted IN ADDITION to loopback. The predicate stays
// pure over (peer, ranges) — the forwarding-header belt that refuses the WIDENED arm is composed in
// `resolve` (index.ts), never here.
describe("ownerFallbackAllowed — the opt-in widened peer set", () => {
  const DockerBridge = ["172.17.0.0/16"] as const;

  test("an empty list is byte-identical to today: loopback in, docker bridge out", () => {
    expect(ownerFallbackAllowed("127.0.0.1", [])).toBe(true);
    expect(ownerFallbackAllowed("172.17.0.1", [])).toBe(false);
  });

  test("a peer inside a listed range is admitted (the containerized single-user case)", () => {
    expect(ownerFallbackAllowed("172.17.0.1", DockerBridge)).toBe(true);
  });

  test("loopback stays admitted while a list is set (the widening is ADDITIVE, never a replacement)", () => {
    expect(ownerFallbackAllowed("127.0.0.1", DockerBridge)).toBe(true);
    expect(ownerFallbackAllowed("::1", DockerBridge)).toBe(true);
  });

  test("a private peer OUTSIDE every listed range is still denied (the list is not 'any private address')", () => {
    expect(ownerFallbackAllowed("10.9.9.9", DockerBridge)).toBe(false);
    expect(ownerFallbackAllowed("192.168.1.27", DockerBridge)).toBe(false);
    expect(ownerFallbackAllowed("172.18.0.1", DockerBridge)).toBe(false);
    expect(ownerFallbackAllowed("203.0.113.9", DockerBridge)).toBe(false);
  });

  test("an IPv4-mapped IPv6 peer reduces to its v4 value and matches a v4 range", () => {
    expect(ownerFallbackAllowed("::ffff:172.17.0.1", DockerBridge)).toBe(true);
    expect(ownerFallbackAllowed("::ffff:172.18.0.1", DockerBridge)).toBe(false);
  });

  test("an IPv6 range works too (a v6-only docker network)", () => {
    expect(ownerFallbackAllowed("fd00:dead:beef::2", ["fd00:dead:beef::/48"])).toBe(true);
    expect(ownerFallbackAllowed("fd01::2", ["fd00:dead:beef::/48"])).toBe(false);
  });

  test("an ABSENT peer fails closed even with a list set — a widened set is not a way to lose the credential", () => {
    expect(ownerFallbackAllowed(undefined, DockerBridge)).toBe(false);
    expect(ownerFallbackAllowed(undefined, ["0.0.0.0/0"])).toBe(false);
  });
});
