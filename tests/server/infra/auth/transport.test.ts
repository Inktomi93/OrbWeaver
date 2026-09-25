// infra/auth/transport — the per-request cookie transport and client scope. `https` is only ever a trusted
// proxy's assertion: the app never terminates TLS, so an absent, mixed or untrusted `X-Forwarded-Proto` is
// plain http. The trusted-peer predicate is the one `resolveClientIp` uses for `X-Forwarded-For`.

import { resolveClientScope, resolveTransport } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const NO_PROXIES: readonly string[] = [];

describe("resolveTransport", () => {
  test.each([
    ["a loopback peer (a same-host proxy)", "127.0.0.1"],
    ["a private peer (a proxy container on the bridge)", "172.18.0.5"],
    ["an IPv4-mapped loopback peer", "::ffff:127.0.0.1"],
  ])("X-Forwarded-Proto: https from %s → https", (_label, peer) => {
    expect(resolveTransport({ peer, forwardedProto: "https", trustedProxies: NO_PROXIES })).toBe("https");
  });

  test("X-Forwarded-Proto: https from a PUBLIC peer → http (a direct visitor cannot assert TLS)", () => {
    expect(resolveTransport({ peer: "203.0.113.9", forwardedProto: "https", trustedProxies: NO_PROXIES })).toBe("http");
  });

  test("a public peer listed in FORWARD_AUTH_TRUSTED_PROXIES is believed", () => {
    expect(resolveTransport({ peer: "203.0.113.9", forwardedProto: "https", trustedProxies: ["203.0.113.0/24"] })).toBe("https");
  });

  test.each([
    ["absent", null],
    ["empty", ""],
    ["plain http", "http"],
    ["a forged http appended behind the proxy's https", "https, http"],
    ["a forged http prepended before the proxy's https", "http, https"],
    ["an empty hop", "https, "],
  ])("X-Forwarded-Proto %s from a trusted peer → http (every value must be https)", (_label, forwardedProto) => {
    expect(resolveTransport({ peer: "127.0.0.1", forwardedProto, trustedProxies: NO_PROXIES })).toBe("http");
  });

  test("every hop asserting https (a proxy chain) → https; the scheme is case-insensitive", () => {
    expect(resolveTransport({ peer: "10.0.0.2", forwardedProto: "https, HTTPS", trustedProxies: NO_PROXIES })).toBe("https");
  });

  test("an unknown peer → http", () => {
    expect(resolveTransport({ peer: undefined, forwardedProto: "https", trustedProxies: NO_PROXIES })).toBe("http");
  });
});

describe("resolveClientScope", () => {
  // This machine: nothing crosses a network, so the login notice stays silent.
  test.each(["127.0.0.1", "127.8.9.10", "::1"])("%s → loopback", (ip) => {
    expect(resolveClientScope(ip)).toBe("loopback");
  });

  test.each(["192.168.1.20", "10.1.2.3", "172.17.0.1", "100.64.3.4", "fd00::1"])("%s → private", (ip) => {
    expect(resolveClientScope(ip)).toBe("private");
  });

  test.each(["203.0.113.9", "8.8.8.8", "2606:4700::1111"])("%s → public", (ip) => {
    expect(resolveClientScope(ip)).toBe("public");
  });

  // Only a warning rides on the scope, so an unresolvable address takes the direction that warns.
  test("an unresolved client → public", () => {
    expect(resolveClientScope(null)).toBe("public");
  });
});
