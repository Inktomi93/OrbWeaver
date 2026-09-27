import { DEFAULT_TRUSTED_RANGES, isInRanges, isPrivateOrLoopback, isPublicUnicast, matchesCidr } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

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

// The IP certificate (D269) is asked for only at an address a public certificate authority can reach.
describe("isPublicUnicast", () => {
  test("a public IPv4 and a global unicast IPv6 are public", () => {
    for (const ip of ["81.2.69.160", "1.1.1.1", "2a00:1450:4001:80b::200e", "2606:4700:4700::1111"]) {
      expect({ ip, public: isPublicUnicast(ip) }).toEqual({ ip, public: true });
    }
  });

  test("LAN, CGNAT, loopback, link-local and unspecified addresses are not", () => {
    for (const ip of [
      "10.0.0.5",
      "172.16.4.1",
      "192.168.1.20",
      "100.64.0.1",
      "100.127.255.254",
      "127.0.0.1",
      "169.254.1.1",
      "0.0.0.0",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
    ]) {
      expect({ ip, public: isPublicUnicast(ip) }).toEqual({ ip, public: false });
    }
  });

  test("documentation, benchmarking, reserved, multicast and broadcast blocks are not", () => {
    for (const ip of [
      "192.0.2.1",
      "198.51.100.7",
      "203.0.113.9",
      "198.18.0.1",
      "192.0.0.8",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
      "2001:db8::1",
      "3fff::1",
      "ff02::1",
      "64:ff9b::808:808",
      "2002:808:808::1",
      "2001::1",
      "100::1",
    ]) {
      expect({ ip, public: isPublicUnicast(ip) }).toEqual({ ip, public: false });
    }
  });

  test("an IPv6 address outside 2000::/3 is not global unicast", () => {
    expect(isPublicUnicast("4000::1")).toBe(false);
    expect(isPublicUnicast("1000::1")).toBe(false);
  });

  test("an IPv4-mapped address is judged as its IPv4 value, and a name or garbage is not an address", () => {
    expect(isPublicUnicast("::ffff:192.168.1.1")).toBe(false);
    expect(isPublicUnicast("example.com")).toBe(false);
    expect(isPublicUnicast("081.2.69.160")).toBe(false);
    expect(isPublicUnicast("")).toBe(false);
  });
});
