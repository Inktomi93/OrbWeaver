import { normalizeHost } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// Pure host normalize — lowercase + strip `:port`, with the bracketed-IPv6 form unwrapped and the bare
// IPv6 literal left intact. Load-bearing for the owner-fallback origin gate (a mis-normalized host could
// match — or fail to match — the local-origin allowlist). No env, no I/O → fully exercisable here.

describe("normalizeHost", () => {
  test("lowercases the host", () => {
    expect(normalizeHost("EXAMPLE.COM")).toBe("example.com");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeHost("  example.com  ")).toBe("example.com");
  });

  test("strips the :port from a hostname", () => {
    expect(normalizeHost("example.com:443")).toBe("example.com");
  });

  test("strips the :port from an IPv4 literal", () => {
    expect(normalizeHost("127.0.0.1:8788")).toBe("127.0.0.1");
  });

  test("a port-less hostname passes through unchanged", () => {
    expect(normalizeHost("localhost")).toBe("localhost");
  });

  test("unwraps a bracketed IPv6 literal with a port", () => {
    expect(normalizeHost("[::1]:8788")).toBe("::1");
  });

  test("unwraps a bracketed IPv6 literal without a port", () => {
    expect(normalizeHost("[2001:db8::1]")).toBe("2001:db8::1");
  });

  test("tolerates a bracketed IPv6 literal missing its close bracket", () => {
    expect(normalizeHost("[::1")).toBe("::1");
  });

  test("leaves a BARE IPv6 literal (multiple colons, no brackets) intact — not a host:port", () => {
    expect(normalizeHost("::1")).toBe("::1");
    expect(normalizeHost("fe80::1")).toBe("fe80::1");
  });

  test("lowercases inside an unwrapped bracketed IPv6 literal", () => {
    expect(normalizeHost("[2001:DB8::AB]:443")).toBe("2001:db8::ab");
  });
});
