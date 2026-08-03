import { DEFAULT_TRUSTED_RANGES, isInRanges, isPrivateOrLoopback, matchesCidr, parseIp } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("parseIp", () => {
  test("parses an IPv4 dotted-quad (32-bit)", () => {
    expect(parseIp("127.0.0.1")?.bits).toBe(32);
  });

  test("parses an IPv6 literal (128-bit)", () => {
    expect(parseIp("::1")?.bits).toBe(128);
  });

  test("reduces an IPv4-mapped IPv6 address to plain v4", () => {
    expect(parseIp("::ffff:127.0.0.1")?.bits).toBe(32);
  });

  test("rejects a non-IP string", () => {
    expect(parseIp("not-an-ip")).toBeNull();
  });

  test("rejects an octet > 255", () => {
    expect(parseIp("999.0.0.1")).toBeNull();
  });
});

describe("matchesCidr", () => {
  test("matches an address inside the range", () => {
    expect(matchesCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
  });

  test("excludes an address outside the range", () => {
    expect(matchesCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
  });

  test("a bare IP is treated as a host (/max) match", () => {
    expect(matchesCidr("8.8.8.8", "8.8.8.8")).toBe(true);
  });

  test("a trailing-slash prefix fails CLOSED (never a /0 match-all)", () => {
    expect(matchesCidr("8.8.8.8", "10.0.0.0/")).toBe(false);
  });

  test("matches an IPv6 ULA inside fc00::/7", () => {
    expect(matchesCidr("fc00::1234", "fc00::/7")).toBe(true);
  });
});

describe("isPrivateOrLoopback / isInRanges", () => {
  test("loopback is private", () => {
    expect(isPrivateOrLoopback("127.0.0.1")).toBe(true);
  });

  test("RFC1918 is private", () => {
    expect(isPrivateOrLoopback("192.168.1.50")).toBe(true);
  });

  test("Tailscale CGNAT (100.64.0.0/10) is private", () => {
    expect(isPrivateOrLoopback("100.96.0.1")).toBe(true);
  });

  test("a public address is NOT private", () => {
    expect(isPrivateOrLoopback("8.8.8.8")).toBe(false);
  });

  test("isInRanges honors an explicit custom range list (and the built-ins exclude it)", () => {
    expect(isInRanges("203.0.113.5", ["203.0.113.0/24"])).toBe(true);
    expect(isInRanges("203.0.113.5", DEFAULT_TRUSTED_RANGES)).toBe(false);
  });

  test("IPv4 multicast (224.0.0.0/4, incl. SSDP) is denied; 240.x class-E outside /4 is not", () => {
    expect(isPrivateOrLoopback("224.0.0.1")).toBe(true);
    expect(isPrivateOrLoopback("239.255.255.250")).toBe(true); // SSDP
    expect(isPrivateOrLoopback("240.0.0.1")).toBe(false); // outside 224.0.0.0/4
  });

  test("RFC2544 benchmarking (198.18.0.0/15) is denied; the adjacent 198.20.x is not", () => {
    expect(isPrivateOrLoopback("198.18.0.1")).toBe(true);
    expect(isPrivateOrLoopback("198.19.255.254")).toBe(true);
    expect(isPrivateOrLoopback("198.20.0.1")).toBe(false); // outside the /15
  });

  test("6to4 (2002::/16) embedding a private IPv4 is denied", () => {
    // 2002:0a00:0001::/48 embeds 10.0.0.1 in the 6to4 v4 field — the whole 2002::/16 block is denied.
    expect(isPrivateOrLoopback("2002:a00:1::1")).toBe(true);
    // 6to4 wrapping the cloud-metadata address (169.254.169.254 → a9fe:a9fe).
    expect(isPrivateOrLoopback("2002:a9fe:a9fe::1")).toBe(true);
  });

  test("Teredo (2001::/32) that can tunnel to an internal v4 is denied", () => {
    // A Teredo address carries a server + obfuscated client v4; the whole 2001::/32 tunnel block is denied.
    expect(isPrivateOrLoopback("2001:0:0:0:0:0:a00:1")).toBe(true);
    expect(isPrivateOrLoopback("2001:0:53aa:64c:8:c0a8:1:1")).toBe(true); // embeds 192.168.x in the client field
  });
});
