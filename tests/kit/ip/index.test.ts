// @orb/kit/ip — the one IP literal parse. It is total: request headers reach it, so malformed input is null.

import { parseIp } from "@orb/kit/ip";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

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

test("an IPv6 literal with more than eight groups around `::` is null, never a thrown RangeError", () => {
  expect(parseIp("1:2:3:4:5:6:7:8::9")).toBeNull();
  // Control: the same shape with room for the `::` still parses.
  expect(parseIp("1:2:3:4:5:6::9")?.bits).toBe(128);
});
