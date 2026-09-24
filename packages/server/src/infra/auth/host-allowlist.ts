// The Host allowlist decision and its throttled security line. It refuses only and is never a trust input:
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

import { ALLOWED_HOST_SUFFIX_MARK, isAlwaysAllowedHost, withoutTrailingDot } from "@orb/kit/allowed-hosts";
import { securityEvent } from "#foundation/observability";
import { isTrustedHop } from "#infra/network";
import type { HostNotAllowedNotice } from "./contract.ts";
import { normalizeHost } from "./host.ts";
import { createKeyedNoticeThrottle } from "./notice-throttle.ts";

const VALUE_SEPARATOR = ",";
// RFC 1035's name bound: a longer value is no DNS name, and the refusal and the log line echo at most this much.
const MAX_ECHO_CHARS = 253;

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
