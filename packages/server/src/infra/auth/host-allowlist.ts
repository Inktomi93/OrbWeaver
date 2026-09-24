// The Host allowlist decision, its relay host registry and its throttled security line. It refuses only and is never a trust input:
// a request whose hosts all pass is judged by every later control exactly as before (spine invariant 7).
//
// WHY IT EXISTS. A page on a name its owner rebinds to 127.0.0.1 is same-origin with this server, so its script
// reaches every route from a loopback socket with no forwarding header and any custom header it likes. The
// loopback owner fallback, the local first-run claim and a loopback-trusted forward-header proxy then serve it.
// A browser cannot forge `Host` on its own requests (a forbidden header), so the foreign name is the one tell.
//
// X-FORWARDED-HOST ADDS A CHECK, IT NEVER REPLACES `Host`. It is read only from a trusted hop (`isTrustedHop`),
// and loopback is a trusted hop, so the rebinding page can send it too. Letting it stand in for `Host` would
// let that page pass with `X-Forwarded-Host: localhost`. A proxy that rewrites `Host` to its upstream name
// needs that name allowed too.

import { ALLOWED_HOST_SUFFIX_MARK, isAlwaysAllowedHost, isHostname, withoutTrailingDot } from "@orb/kit/allowed-hosts";
import { DomainOperationError } from "@orb/kit/errors";
import { securityEvent } from "#foundation/observability";
import { isTrustedHop } from "#infra/network";
import type { AllowedHostsReader, HostNotAllowedNotice, RelayHostRegistry } from "./contract.ts";
import { normalizeHost } from "./host.ts";
import { createKeyedNoticeThrottle } from "./notice-throttle.ts";

const VALUE_SEPARATOR = ",";
// RFC 1035's name bound: a longer value is no DNS name, and the refusal and the log line echo at most this much.
const MAX_ECHO_CHARS = 253;
const RELAY_HOST_INVALID = "relay_host_invalid";

/** The request facts the decision reads. `forwardedHost` counts only when `peer` is a trusted hop. */
export interface HostFacts {
  /** The `Host` header, absent on HTTP/2 and on an in-process request. */
  readonly hostHeader: string | undefined;
  /** The authority of the request URL, which the node adapter builds from `Host` or the absolute request line. */
  readonly urlHost: string;
  readonly forwardedHost: string | undefined;
  /** The raw TCP peer; read only when `forwardedHost` is present. */
  readonly peer: () => string | undefined;
  readonly trustedProxies: readonly string[];
}

/** One authority as a bare, comparable host: lower-cased, no port, no brackets, no trailing dot. An IPv6 zone id
 *  stays on; `isAlwaysAllowedHost` owns reading an IP literal. */
export function canonicalHost(authority: string): string {
  return withoutTrailingDot(normalizeHost(authority));
}

/** True for an always-allowed host (`isAlwaysAllowedHost`: localhost, `*.localhost`, an IP literal) and a configured
 *  name (`resolveAllowedHosts`). A leading-dot entry admits its name and every subdomain. `host` is already
 *  {@link canonicalHost}. */
export function isHostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  if (isAlwaysAllowedHost(host)) {
    return true;
  }
  // Configured entries are hostnames, so only a hostname may match one: a value with `:` or `%` that merely ends in
  // an allowed suffix (`a:%x.example.com`) is neither a name nor an IP literal and must not pass `endsWith`.
  if (!isHostname(host)) {
    return false;
  }
  return allowedHosts.some((entry) =>
    entry.startsWith(ALLOWED_HOST_SUFFIX_MARK) ? host === entry.slice(ALLOWED_HOST_SUFFIX_MARK.length) || host.endsWith(entry) : host === entry,
  );
}

/** The first host this request names that is not allowed, canonical and length-capped, or null to admit it. Judged:
 *  the `Host` header, the URL authority, and every `X-Forwarded-Host` value when the peer is a trusted hop. */
export function refusedHost(facts: HostFacts, allowedHosts: readonly string[]): string | null {
  const authorities = [facts.urlHost];
  if (facts.hostHeader !== undefined) {
    authorities.push(facts.hostHeader);
  }
  if (facts.forwardedHost !== undefined) {
    const peer = facts.peer();
    if (peer !== undefined && isTrustedHop(peer, facts.trustedProxies)) {
      authorities.push(...facts.forwardedHost.split(VALUE_SEPARATOR));
    }
  }
  for (const authority of authorities) {
    const host = canonicalHost(authority);
    if (!isHostAllowed(host, allowedHosts)) {
      return host.slice(0, MAX_ECHO_CHARS);
    }
  }
  return null;
}

// A relay reports a name the server did not choose (a quick tunnel's random host, a sidecar's metrics answer), so the
// write refuses anything but one exact hostname: a dot-led value here would admit every tunnel anyone runs.
function relayHostOrThrow(host: string): string {
  const name = withoutTrailingDot(host.toLowerCase());
  if (!isHostname(name)) {
    throw new DomainOperationError(RELAY_HOST_INVALID, `The relay reported "${host.slice(0, MAX_ECHO_CHARS)}", which is not one exact relay host name.`);
  }
  return name;
}

/** The server-owned relay host set beside the configured names. It lives in memory only, so a restart clears it, and it
 *  has no operator switch: the relay controller is its one writer (spine invariant 7 still judges every request). */
export function createRelayHostRegistry(): RelayHostRegistry {
  const names = new Set<string>();
  let snapshot: readonly string[] = [];
  const publish = (): void => {
    snapshot = [...names];
  };
  return {
    hosts: (): readonly string[] => snapshot,
    writer: {
      add: (host): string => {
        const name = relayHostOrThrow(host);
        names.add(name);
        publish();
        return name;
      },
      remove: (host): void => {
        names.delete(withoutTrailingDot(host.toLowerCase()));
        publish();
      },
      clear: (): void => {
        names.clear();
        publish();
      },
    },
  };
}

/** The one reader the Host allowlist takes: the configured names, then the relay registry's names at request time. */
export function allowedHostsReader(configured: readonly string[], relayHosts: AllowedHostsReader): AllowedHostsReader {
  return (): readonly string[] => {
    const relay = relayHosts();
    return relay.length === 0 ? configured : [...configured, ...relay];
  };
}

/** The unthrottled line for one refused host. */
export function reportHostNotAllowed(host: string): void {
  securityEvent(
    "host_not_allowed",
    { host },
    "security: refused a request for a host that is not localhost, an IP address, this machine's name or a name in ALLOWED_HOSTS. If the host is " +
      "your own address, add it to ALLOWED_HOSTS and restart. A name you do not recognise is a page trying to reach this " +
      "server through a visitor's browser (DNS rebinding); do not add it.",
  );
}

/** One line per refused host per hour; the key map is bounded (`notice-throttle.ts`), because the sender picks the
 *  name. `now` is the composition root's clock. */
export function createHostNotAllowedNotice(now: () => number): HostNotAllowedNotice {
  const throttle = createKeyedNoticeThrottle(now);
  return (host) => {
    throttle(host, () => {
      reportHostNotAllowed(host);
    });
  };
}
