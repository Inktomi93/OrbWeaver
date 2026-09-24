// infra/auth/host-allowlist — the DNS-rebinding decision. A browser cannot forge `Host`, so a rebound page is
// refused on it; `X-Forwarded-Host` only ever adds a host to judge, from a trusted hop, and never replaces `Host`.

import { resolveAllowedHosts } from "@orb/server/foundation/env";
import { logger } from "@orb/server/foundation/observability";
import type { HostFacts } from "@orb/server/infra/auth";
import { allowedHostsReader, canonicalHost, createHostNotAllowedNotice, createRelayHostRegistry, isHostAllowed, refusedHost } from "@orb/server/infra/auth";
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
// A quick tunnel's random name, as the relay reports it.
const RELAY = "quiet-fox-lamp.trycloudflare.com";

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
    ["[fe80::1%25eth0]:8788", "fe80::1%25eth0"],
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
    "fe80::1%25eth0",
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

  test("a configured entry matches only a hostname: a zone-shaped value ending in the suffix is refused", () => {
    const allowed = [".example.com"];
    expect(refusedHost(facts("[a:%x.example.com]:8788"), allowed)).not.toBeNull();
    expect(refusedHost(facts("a:b:%x.example.com"), allowed)).not.toBeNull();
    // Control: a real subdomain is still admitted.
    expect(refusedHost(facts("x.example.com:8788"), allowed)).toBeNull();
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

describe("the relay host registry", () => {
  function harness(): {
    readonly registry: ReturnType<typeof createRelayHostRegistry>;
    readonly admit: (host: string) => boolean;
    readonly logged: () => unknown[];
  } {
    const spy = vi.spyOn(logger, "warn");
    const registry = createRelayHostRegistry();
    // The env list is empty: only the relay registry can admit a relay name.
    const allowed = allowedHostsReader(NONE, registry.hosts);
    const notice = createHostNotAllowedNotice(() => T0);
    return {
      registry,
      // One request as the middleware judges it: the reader is read per request, and a refusal takes the throttled notice.
      admit: (host): boolean => {
        const refused = refusedHost(facts(host), allowed());
        if (refused !== null) {
          notice(refused);
        }
        return refused === null;
      },
      logged: (): unknown[] =>
        spy.mock.calls.flatMap(([bindings, message]) => {
          const fields = bindings as Record<string, unknown>;
          return fields["event"] === EVENT ? [[fields["host"], message]] : [];
        }),
    };
  }

  test("a name in the relay registry passes while the env list is empty; removing it refuses the next request", () => {
    const h = harness();
    expect(h.admit(RELAY)).toBe(false);
    h.registry.writer.add(RELAY);
    expect(h.admit(RELAY)).toBe(true);
    h.registry.writer.remove(RELAY);
    expect(h.admit(RELAY)).toBe(false);
  });

  test("control: a name never registered is refused with the same throttled line", () => {
    const h = harness();
    h.registry.writer.add(RELAY);
    h.registry.writer.remove(RELAY);
    const stranger = "other-tunnel.trycloudflare.com";
    for (let i = 0; i < 3; i += 1) {
      expect(h.admit(RELAY)).toBe(false);
      expect(h.admit(stranger)).toBe(false);
    }
    const lines = h.logged();
    expect(lines.map(([host]) => host)).toEqual([RELAY, stranger]);
    const [[, removedLine], [, strangerLine]] = lines as [[string, string], [string, string]];
    expect(removedLine).toBe(strangerLine);
  });

  test("clear drops every relay name", () => {
    const h = harness();
    h.registry.writer.add(RELAY);
    h.registry.writer.clear();
    expect(h.admit(RELAY)).toBe(false);
    expect(h.registry.hosts()).toEqual([]);
  });

  test("exact names only: a suffix, a wildcard or a name with a port is refused, and a registered name admits no subdomain", () => {
    const h = harness();
    for (const bad of [".trycloudflare.com", "*.trycloudflare.com", `${RELAY}:443`, `https://${RELAY}`, "", "a b.example"]) {
      expect(() => h.registry.writer.add(bad), bad).toThrow(/relay host/u);
    }
    expect(h.registry.hosts()).toEqual([]);
    expect(h.admit(RELAY)).toBe(false);
    h.registry.writer.add(RELAY);
    expect(h.admit(`sub.${RELAY}`)).toBe(false);
  });

  test("a relay name is canonical on write, so the reported spelling matches the request's", () => {
    const h = harness();
    expect(h.registry.writer.add("Quiet-Fox-Lamp.TryCloudflare.com.")).toBe(RELAY);
    expect(h.admit(RELAY)).toBe(true);
    h.registry.writer.remove("QUIET-FOX-LAMP.trycloudflare.com");
    expect(h.admit(RELAY)).toBe(false);
  });

  test("the reader unions the configured list: env names still pass beside a relay name", () => {
    const registry = createRelayHostRegistry();
    const allowed = allowedHostsReader(["nas.local", ".example.com"], registry.hosts);
    registry.writer.add(RELAY);
    expect(allowed()).toEqual(["nas.local", ".example.com", RELAY]);
    expect(refusedHost(facts("x.example.com"), allowed())).toBeNull();
  });
});
