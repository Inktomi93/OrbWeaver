// infra/network/ingress — the ingress edge belt's pure cores. Pins the anti-spoof rule
// (XFF is honored ONLY behind a trusted peer, and read from the right — no client can spoof its rate-limit /
// allowlist identity) and the allowlist decision (loopback/private always allowed; null ip degrades to
// allowed — a belt, not the auth layer). The Hono middleware/context wrappers are thin shells over these.

import { ipAllowlistMiddleware, isIngressAllowed, parseAllowlist, resolveClientIp } from "@orb/server/infra/network";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("parseAllowlist", () => {
  test("splits, trims, and drops empties; unset is the empty belt-off list", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist(" 10.0.0.0/8 , 203.0.113.7 ,, ")).toEqual(["10.0.0.0/8", "203.0.113.7"]);
  });
});

describe("resolveClientIp — the peer-vs-XFF trust precedence", () => {
  test("an UNTRUSTED public peer's x-forwarded-for is IGNORED (the spoof pin)", () => {
    expect(resolveClientIp({ peer: "198.51.100.9", forwarded: "1.2.3.4", trustedProxies: [] })).toBe("198.51.100.9");
  });

  test("behind a loopback/private proxy the right-most untrusted hop is the client", () => {
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: "1.2.3.4, 10.0.0.1", trustedProxies: [] })).toBe("1.2.3.4");
  });

  test("an explicitly trusted public proxy yields the XFF hop", () => {
    expect(
      resolveClientIp({
        peer: "198.51.100.9",
        forwarded: "1.2.3.4",
        trustedProxies: ["198.51.100.9"],
      }),
    ).toBe("1.2.3.4");
  });

  test("no/empty XFF falls back to the peer; no peer at all is null", () => {
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: undefined, trustedProxies: [] })).toBe("127.0.0.1");
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: "", trustedProxies: [] })).toBe("127.0.0.1");
    expect(resolveClientIp({ peer: undefined, forwarded: "1.2.3.4", trustedProxies: [] })).toBe(null);
  });
});

// An appending proxy (nginx `$proxy_add_x_forwarded_for`, Caddy, cloudflared) keeps whatever the visitor sent
// on the LEFT and adds the address it saw on the right. Only the right side is a fact.
describe("resolveClientIp — a visitor-supplied leftmost value is never the client", () => {
  const Visitor = "198.51.100.7";

  test.each([
    ["a private value", "10.9.9.9"],
    ["an allowlisted public value", "203.0.113.50"],
    ["a loopback value", "127.0.0.1"],
  ])("a spoofed leftmost %s resolves to the address the proxy appended", (_label, spoof) => {
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: `${spoof}, ${Visitor}`, trustedProxies: [] })).toBe(Visitor);
  });

  test("trusted hops appended by a proxy chain are skipped, never returned", () => {
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: `10.9.9.9, ${Visitor}, 10.0.0.2`, trustedProxies: [] })).toBe(Visitor);
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: `6.6.6.6, ${Visitor}, 192.0.2.10`, trustedProxies: ["192.0.2.0/24"] })).toBe(Visitor);
  });

  test("a client on a private network behind the proxy is itself when every hop is trusted", () => {
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: "192.168.1.5", trustedProxies: [] })).toBe("192.168.1.5");
  });

  test("an unparseable hop ends the walk at the last address a trusted hop vouched for", () => {
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: `${Visitor}, unknown`, trustedProxies: [] })).toBe("127.0.0.1");
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: "not-an-ip, 10.0.0.2", trustedProxies: [] })).toBe("10.0.0.2");
  });
});

describe("isIngressAllowed — the allowlist gate decision", () => {
  test("loopback/private is always allowed (the operator's own box)", () => {
    expect(isIngressAllowed("127.0.0.1", ["203.0.113.0/24"])).toBe(true);
    expect(isIngressAllowed("192.168.1.5", ["203.0.113.0/24"])).toBe(true);
  });

  test("a public caller must match the allowlist", () => {
    expect(isIngressAllowed("203.0.113.7", ["203.0.113.0/24"])).toBe(true);
    expect(isIngressAllowed("198.51.100.9", ["203.0.113.0/24"])).toBe(false);
  });

  test("an unresolvable ip degrades to allowed (a belt, not the auth layer)", () => {
    expect(isIngressAllowed(null, ["203.0.113.0/24"])).toBe(true);
  });
});

describe("ipAllowlistMiddleware — a spoofed leftmost XFF cannot pass the allowlist", () => {
  const appWithAllowlist = (): Hono => {
    const app = new Hono();
    app.use("*", ipAllowlistMiddleware(["203.0.113.0/24"]));
    app.get("/", (c) => c.text("ok"));
    return app;
  };
  const fromLoopbackProxy = { incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 40_000, remoteFamily: "IPv4" } } };

  test.each(["10.9.9.9", "203.0.113.50"])("a visitor claiming %s behind an appending proxy is refused", async (spoof) => {
    const res = await appWithAllowlist().request("/", { headers: { "x-forwarded-for": `${spoof}, 198.51.100.7` } }, fromLoopbackProxy);
    expect(res.status).toBe(403);
  });

  test("control: an allowlisted visitor the proxy appended is admitted", async () => {
    const res = await appWithAllowlist().request("/", { headers: { "x-forwarded-for": "10.9.9.9, 203.0.113.50" } }, fromLoopbackProxy);
    expect(res.status).toBe(200);
  });
});
