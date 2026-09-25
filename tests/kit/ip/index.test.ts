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

// The ruling: an IPv4 octet with a leading zero is refused, as `node:net` refuses it. getaddrinfo and WHATWG URL read
// `012.0.0.1` as octal (10.0.0.1), so any other reading here would judge a different address than the one dialled.
test("an IPv4 octet with a leading zero is null, in a dotted quad and in an IPv6 tail", () => {
  for (const spelled of ["012.0.0.1", "010.0.0.1", "00.0.0.0", "127.0.0.01", "192.168.001.1", "::ffff:012.0.0.1"]) {
    expect(parseIp(spelled), spelled).toBeNull();
  }
  // Controls: a lone zero octet is not a leading zero, and an IPv6 hextet keeps its leading zeros (RFC 4291).
  expect(parseIp("0.0.0.0")?.bits).toBe(32);
  expect(parseIp("10.0.100.1")?.value).toBe(0x0a006401n);
  expect(parseIp("0000:0000:0000:0000:0000:0000:0000:0001")?.bits).toBe(128);
});

test("an IPv6 literal with more than eight groups around `::` is null, never a thrown RangeError", () => {
  expect(parseIp("1:2:3:4:5:6:7:8::9")).toBeNull();
  // Control: the same shape with room for the `::` still parses.
  expect(parseIp("1:2:3:4:5:6::9")?.bits).toBe(128);
});
