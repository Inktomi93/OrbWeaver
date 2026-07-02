// infra/network/ingress (PD-91) — the ingress edge belt's pure cores. Pins the PD-52 anti-spoof rule
// (XFF is honored ONLY behind a trusted peer — an untrusted client can never spoof its rate-limit /
// allowlist identity) and the allowlist decision (loopback/private always allowed; null ip degrades to
// allowed — a belt, not the auth layer). The Hono middleware/context wrappers are thin shells over these.

import { isIngressAllowed, parseAllowlist, resolveClientIp } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

describe("parseAllowlist", () => {
  test("splits, trims, and drops empties; unset is the empty belt-off list", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist(" 10.0.0.0/8 , 203.0.113.7 ,, ")).toEqual(["10.0.0.0/8", "203.0.113.7"]);
  });
});

describe("resolveClientIp — the PD-52 peer-vs-XFF trust precedence", () => {
  test("an UNTRUSTED public peer's x-forwarded-for is IGNORED (the spoof pin)", () => {
    expect(
      resolveClientIp({ peer: "198.51.100.9", forwarded: "1.2.3.4", trustedProxies: [] }),
    ).toBe("198.51.100.9");
  });

  test("a loopback/private peer (the fronting proxy) yields the leftmost XFF hop", () => {
    expect(
      resolveClientIp({ peer: "127.0.0.1", forwarded: "1.2.3.4, 10.0.0.1", trustedProxies: [] }),
    ).toBe("1.2.3.4");
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
    expect(resolveClientIp({ peer: "127.0.0.1", forwarded: undefined, trustedProxies: [] })).toBe(
      "127.0.0.1",
    );
    expect(resolveClientIp({ peer: undefined, forwarded: "1.2.3.4", trustedProxies: [] })).toBe(
      null,
    );
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
