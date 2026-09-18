// The PROXY-HOP TELL — the pure `Headers` predicate that belts the WIDENED owner-fallback peer set
// (`AUTH_FALLBACK_TRUSTED_PEERS`). Its composition into `resolve` is pinned in `index.test.ts`; what is
// pinned HERE is the predicate's own vocabulary, because "which spellings count" is the whole control: a
// missing member is a proxy this belt does not see, and the belt is already fail-open by construction.

import { hasForwardingHeader } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { headers } from "./_support.ts";

describe("hasForwardingHeader", () => {
  test("a bare request announces no hop", () => {
    expect(hasForwardingHeader(headers())).toBe(false);
    expect(hasForwardingHeader(headers({ host: "127.0.0.1", "user-agent": "curl/8" }))).toBe(false);
  });

  test("each of the three relay spellings is recognised", () => {
    expect(hasForwardingHeader(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(true);
    expect(hasForwardingHeader(headers({ forwarded: "for=203.0.113.9;proto=https" }))).toBe(true);
    expect(hasForwardingHeader(headers({ "x-real-ip": "203.0.113.9" }))).toBe(true);
  });

  test("PRESENCE is the signal, not the value — an empty header still announces a hop", () => {
    // A proxy that relays with an empty XFF has still relayed: the peer is not the deployer's own client.
    expect(hasForwardingHeader(headers({ "x-forwarded-for": "" }))).toBe(true);
  });

  test("the match is case-insensitive (`Headers` normalises; a proxy may send X-Forwarded-For)", () => {
    expect(hasForwardingHeader(headers({ "X-Forwarded-For": "203.0.113.9" }))).toBe(true);
    expect(hasForwardingHeader(headers({ "X-Real-IP": "203.0.113.9" }))).toBe(true);
  });

  test("the set is CLOSED at the three address-bearing tells — `x-forwarded-proto`/`-host` alone are not a hop", () => {
    // Pinned so the boundary is deliberate rather than incidental. The mainstream proxies (Caddy, nginx,
    // Traefik) send an address-bearing tell alongside these, so the belt already sees them; admitting
    // proto/host as tells on their own would only tighten it further (the belt's refusal is the SAFE
    // direction) and is an open widening, not a defect — it needs a ruling, and this pin is where it lands.
    expect(hasForwardingHeader(headers({ "x-forwarded-proto": "https" }))).toBe(false);
    expect(hasForwardingHeader(headers({ "x-forwarded-host": "chat.example.com" }))).toBe(false);
  });
});
