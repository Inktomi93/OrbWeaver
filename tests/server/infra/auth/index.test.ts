import { resolve } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { makeAuthConfig as cfg, headers } from "./_support.ts";

// VERIFICATION-only: `resolve(headers, deps)` → an `IdentityResolution` (the pre-row `ResolvedIdentity`
// + the seam's signals). It carries NO `userId` and NO `role` (invariant #3); it does NOT upsert and
// does NOT mint a `Principal`. The role decision (`determineRole`) + the upsert move to `domain/sessions`
// (4c); the `Principal` mint is `entry/auth/seam.ts` (4e) — that coverage lives there, NOT here.

describe("resolve — the verification output never carries userId or role (invariant #3)", () => {
  test("single-user (loopback peer) → the owner-fallback identity, via:'fallback', NO userId/role", async () => {
    const res = await resolve(headers(), { config: cfg({ mode: "single-user" }), peerIp: "127.0.0.1" });
    expect(res.identity).toEqual({ externalId: null, handle: "owner", groups: [], email: null });
    expect(res.via).toBe("fallback");
    expect(res.identity).not.toHaveProperty("userId");
    expect(res.identity).not.toHaveProperty("role");
  });

  test("a forward-header identity carries only {externalId, handle, groups, email} (no userId/role)", async () => {
    // Infra never produces a cookie identity post-D40 (the seam owns that); the SSO header is the path that
    // DOES mint a pre-row identity here, so it's where invariant #3 is exercised.
    const res = await resolve(headers({ "x-authentik-username": "alice" }), {
      config: cfg({ mode: "forward-header", forwardTrustedProxies: ["10.0.0.0/8"] }),
      peerIp: "10.1.2.3",
    });
    expect(res.identity).not.toBeNull();
    expect(Object.keys(res.identity ?? {}).sort()).toEqual(["email", "externalId", "groups", "handle"]);
  });
});

describe("resolve — owner fallback gates on the TCP peer, not the Host header (#298 f2)", () => {
  test("HEADLINE: a forged non-loopback Host + a NON-loopback peer → identity null (was owner)", async () => {
    // 10.9.9.9 is inside 10/8 — the OLD Host gate returned true and minted owner. The peer (192.168.1.50) is
    // a LAN device, not loopback, so the fallback is now REFUSED regardless of what `Host:` the caller forges.
    const res = await resolve(headers({ host: "10.9.9.9" }), { config: cfg({ mode: "oidc" }), peerIp: "192.168.1.50" });
    expect(res.identity).toBeNull();
  });

  test("single-user + a NON-loopback peer → identity null (the unconditional owner arm is now peer-gated)", async () => {
    const res = await resolve(headers({ host: "chat.example.com" }), { config: cfg({ mode: "single-user" }), peerIp: "203.0.113.9" });
    expect(res.identity).toBeNull();
  });

  test("a LOOPBACK peer → via:'fallback', even with a public-looking Host (dev tooling preserved)", async () => {
    const res = await resolve(headers({ host: "chat.example.com" }), { config: cfg({ mode: "oidc" }), peerIp: "127.0.0.1" });
    expect(res.via).toBe("fallback");
    expect(res.identity?.handle).toBe("owner");
  });

  test("an ABSENT peer fails closed → identity null (no fallback without an unspoofable credential)", async () => {
    const res = await resolve(headers({ host: "127.0.0.1" }), { config: cfg({ mode: "oidc" }) });
    expect(res.identity).toBeNull();
  });

  test("fallback 'deny' + loopback peer → identity null (the knob short-circuits before the peer gate)", async () => {
    const res = await resolve(headers(), { config: cfg({ mode: "single-user", fallback: "deny" }), peerIp: "127.0.0.1" });
    expect(res.identity).toBeNull();
  });
});

describe("resolve — per-request signals", () => {
  test("a forward-header identity → via:'header' (infra never resolves a cookie post-D40)", async () => {
    const res = await resolve(headers({ "x-authentik-username": "alice" }), {
      config: cfg({ mode: "forward-header", forwardTrustedProxies: ["10.0.0.0/8"] }),
      peerIp: "10.1.2.3",
    });
    expect(res.via).toBe("header");
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
