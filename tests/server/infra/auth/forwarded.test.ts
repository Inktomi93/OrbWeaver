// The relay tell: the pure `Headers` predicate that refuses the owner fallback and the local first-run claim
// on a relayed request. Its composition into `resolve` is pinned in `index.test.ts`; what is pinned HERE is
// the predicate's own vocabulary, because "which spellings count" is the whole control: a missing member is
// a proxy or tunnel this guard does not see.

import { hasForwardingHeader } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { headers } from "./_support.ts";

describe("hasForwardingHeader", () => {
  test("a bare request announces no hop", () => {
    expect(hasForwardingHeader(headers())).toBe(false);
    expect(hasForwardingHeader(headers({ host: "127.0.0.1", "user-agent": "curl/8" }))).toBe(false);
  });

  // One row per member of the closed set. cloudflared sends `cf-connecting-ip` and `x-forwarded-proto`;
  // `tailscale serve` sends `x-forwarded-host`; each must refuse on its own.
  test.each([
    ["forwarded", "for=203.0.113.9;proto=https"],
    ["x-forwarded-for", "203.0.113.9"],
    ["x-real-ip", "203.0.113.9"],
    ["cf-connecting-ip", "203.0.113.9"],
    ["x-forwarded-proto", "https"],
    ["x-forwarded-host", "chat.example.com"],
  ])("`%s` alone announces a hop", (name, value) => {
    expect(hasForwardingHeader(headers({ [name]: value }))).toBe(true);
  });

  test("PRESENCE is the signal, not the value — an empty header still announces a hop", () => {
    // A proxy that relays with an empty XFF has still relayed: the peer is not the deployer's own client.
    expect(hasForwardingHeader(headers({ "x-forwarded-for": "" }))).toBe(true);
  });

  test("the match is case-insensitive (`Headers` normalises; a proxy may send X-Forwarded-For)", () => {
    expect(hasForwardingHeader(headers({ "X-Forwarded-For": "203.0.113.9" }))).toBe(true);
    expect(hasForwardingHeader(headers({ "CF-Connecting-IP": "203.0.113.9" }))).toBe(true);
  });

  test("a header outside the closed set is not a tell (`Host` is never a trust input)", () => {
    expect(hasForwardingHeader(headers({ host: "chat.example.com", "x-forwarded-user": "alice" }))).toBe(false);
  });
});
