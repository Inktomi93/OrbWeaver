import { isLocalOrigin, MODE_RESOLVERS, ownerFallbackAllowed } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";
import { makeAuthConfig as cfg, headers } from "./_support";

// The dispatch seam: the `MODE_RESOLVERS` Record (one entry per AUTH_MODE — invariant #4) + the
// origin-gated owner-fallback predicate. Each resolver yields a pre-row `ResolvedIdentity | null`
// (NO userId/role).

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

  test("forward-header returns a pre-row identity from a trusted PEER (in the declared range)", async () => {
    const res = await MODE_RESOLVERS["forward-header"](
      headers({ "x-authentik-username": "alice" }),
      cfg({ mode: "forward-header", forwardTrustedProxies: ["10.0.0.0/8"] }),
      { peerIp: "10.1.2.3" },
    );
    expect(res).toEqual({ externalId: null, handle: "alice", groups: [], email: null });
  });

  test("forward-header unsigned path is FAIL-CLOSED when FORWARD_AUTH_TRUSTED_PROXIES is unset (B1)", async () => {
    const res = await MODE_RESOLVERS["forward-header"](
      headers({ "x-authentik-username": "alice" }),
      cfg({ mode: "forward-header" }),
      {},
    );
    expect(res).toBeNull();
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
