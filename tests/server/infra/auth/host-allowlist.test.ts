// infra/auth/host-allowlist — the DNS-rebinding decision. A browser cannot forge `Host`, so a rebound page is
// refused on it; `X-Forwarded-Host` only ever adds a host to judge, from a trusted hop, and never replaces `Host`.

import { resolveAllowedHosts } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import type { HostFacts } from "@orb/server/infra/auth";
import { canonicalHost, createHostNotAllowedNotice, isHostAllowed, refusedHost } from "@orb/server/infra/auth";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
// The throttle's window and key cap, mirrored so the tests can step past them (`notice-throttle.test.ts`).
const HOUR_MS = 3_600_000;
const MAX_KEYS = 1024;
const EVENT = "host_not_allowed";
const REBOUND = "rebind.attacker.example";
const LOOPBACK_PEER = "127.0.0.1";
const PUBLIC_PEER = "203.0.113.9";
// The owner's Caddy container: a private peer, so a trusted hop.
const CADDY_PEER = "172.18.0.100";
const NONE: readonly string[] = [];

/** A request from `peer` for `host`, as the node adapter hands it over (URL authority built from `Host`). */
function facts(host: string, over: Partial<HostFacts> = {}, peer = LOOPBACK_PEER): HostFacts {
  return { hostHeader: host, urlHost: host, forwardedHost: undefined, peer: () => peer, trustedProxies: NONE, ...over };
}

describe("canonicalHost", () => {
  test.each([
    ["LOCALHOST:8788", "localhost"],
    ["localhost.", "localhost"],
    ["Example.COM.:443", "example.com"],
    ["[::1]:8788", "::1"],
    ["[::ffff:127.0.0.1]:8788", "::ffff:127.0.0.1"],
    ["[fe80::1%25eth0]:8788", "fe80::1"],
    ["MYBOX:8788", "mybox"],
  ])("%s → %s", (authority, host) => {
    expect(canonicalHost(authority)).toBe(host);
  });
});

describe("isHostAllowed", () => {
  test.each([
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "10.0.0.5",
    "100.101.102.103", // a tailnet address
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
  ])("%s always passes, with nothing configured", (host) => {
    expect(isHostAllowed(host, NONE)).toBe(true);
  });

  test.each([
    REBOUND,
    "localhost.attacker.example",
    "evil-localhost",
    "127.0.0.1.attacker.example",
    "0x7f000001",
    "machine.tailnet.ts.net",
  ])("%s is refused with nothing configured", (host) => {
    expect(isHostAllowed(host, NONE)).toBe(false);
  });

  test("an exact entry admits that name only", () => {
    expect(isHostAllowed("nas.local", ["nas.local"])).toBe(true);
    expect(isHostAllowed("sub.nas.local", ["nas.local"])).toBe(false);
  });

  test("a dot-led entry admits the name and every subdomain, and nothing that only ends in the same letters", () => {
    const allowed = [".ts.net"];
    expect(isHostAllowed("ts.net", allowed)).toBe(true);
    expect(isHostAllowed("machine.tailnet.ts.net", allowed)).toBe(true);
    expect(isHostAllowed("attackerts.net", allowed)).toBe(false);
  });
});

describe("refusedHost", () => {
  test("a rebound name on the loopback socket is refused", () => {
    expect(refusedHost(facts(`${REBOUND}:8788`), NONE)).toBe(REBOUND);
  });

  test("forging X-Forwarded-Host from the loopback socket does not stand in for Host", () => {
    expect(refusedHost(facts(`${REBOUND}:8788`, { forwardedHost: "localhost:8788" }), NONE)).toBe(REBOUND);
  });

  test("a trusted hop's X-Forwarded-Host is judged: every value, beside Host", () => {
    expect(refusedHost(facts("localhost:8788", { forwardedHost: REBOUND }, CADDY_PEER), NONE)).toBe(REBOUND);
    expect(refusedHost(facts("localhost:8788", { forwardedHost: `localhost, ${REBOUND}` }, CADDY_PEER), NONE)).toBe(REBOUND);
  });

  test("a public peer's X-Forwarded-Host is ignored and Host is judged", () => {
    expect(refusedHost(facts("localhost:8788", { forwardedHost: REBOUND }, PUBLIC_PEER), NONE)).toBeNull();
    expect(refusedHost(facts(REBOUND, { forwardedHost: "localhost" }, PUBLIC_PEER), NONE)).toBe(REBOUND);
  });

  test("a peer in FORWARD_AUTH_TRUSTED_PROXIES is a trusted hop too", () => {
    expect(refusedHost(facts("localhost", { forwardedHost: REBOUND, trustedProxies: ["203.0.113.0/24"] }, PUBLIC_PEER), NONE)).toBe(REBOUND);
  });

  test("the peer is read only when X-Forwarded-Host is present", () => {
    const peer = vi.fn(() => LOOPBACK_PEER);
    expect(refusedHost(facts("localhost:8788", { peer }), NONE)).toBeNull();
    expect(peer).not.toHaveBeenCalled();
  });

  test("the URL authority is judged when it differs from Host (an absolute-form request line)", () => {
    expect(refusedHost(facts("localhost", { urlHost: REBOUND }), NONE)).toBe(REBOUND);
    expect(refusedHost(facts("localhost", { hostHeader: undefined }), NONE)).toBeNull();
  });

  test("the owner's box: Caddy passes Host and X-Forwarded-Host, and the OIDC callback host admits both", () => {
    const allowed = resolveAllowedHosts({
      allowedHosts: undefined,
      oidcRedirectUris: "https://orbweaver.example.com/api/auth/oidc/callback",
      machineHostname: null,
    });
    const owner = facts("orbweaver.example.com", { forwardedHost: "orbweaver.example.com" }, CADDY_PEER);
    expect(refusedHost(owner, allowed)).toBeNull();
    // Control: the same shape with nothing configured is refused, so the derived host is what admitted it.
    expect(refusedHost(owner, NONE)).toBe("orbweaver.example.com");
  });

  test("on bare metal the machine's own name and its .local form pass unconfigured; a foreign name is still refused", () => {
    const allowed = resolveAllowedHosts({ allowedHosts: undefined, oidcRedirectUris: undefined, machineHostname: "GAME-PC" });
    expect(refusedHost(facts("game-pc:8788"), allowed)).toBeNull();
    expect(refusedHost(facts("Game-PC.local:8788"), allowed)).toBeNull();
    expect(refusedHost(facts(`${REBOUND}:8788`), allowed)).toBe(REBOUND);
    expect(refusedHost(facts("game-pc.attacker.example"), allowed)).toBe("game-pc.attacker.example");
  });

  test("the echoed host is capped at a DNS name's length", () => {
    const refused = refusedHost(facts(`${"a".repeat(400)}.example`), NONE);
    expect(refused).toHaveLength(253);
  });
});

describe("createHostNotAllowedNotice", () => {
  function harness(): { notice: (host: string) => void; advance: (ms: number) => void; logged: () => unknown[] } {
    let at = T0;
    const spy = vi.spyOn(logger, "warn");
    return {
      notice: createHostNotAllowedNotice(() => at),
      advance: (ms): void => {
        at += ms;
      },
      logged: (): unknown[] =>
        spy.mock.calls.flatMap(([bindings]) => {
          const fields = bindings as Record<string, unknown>;
          return fields["event"] === EVENT ? [fields["host"]] : [];
        }),
    };
  }

  test("one refused host logs once per hour", () => {
    const h = harness();
    for (let i = 0; i < 20; i += 1) {
      h.notice(REBOUND);
    }
    expect(h.logged()).toEqual([REBOUND]);
    h.advance(HOUR_MS);
    h.notice(REBOUND);
    expect(h.logged()).toEqual([REBOUND, REBOUND]);
  });

  test("the sender picks the name, so the set of logged names is bounded", () => {
    const h = harness();
    for (let i = 0; i <= MAX_KEYS; i += 1) {
      h.notice(`n${String(i)}.attacker.example`);
    }
    expect(h.logged()).toHaveLength(MAX_KEYS);
  });
});
