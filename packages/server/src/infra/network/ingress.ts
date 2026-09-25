// Ingress IP-allowlist belt. Anti-spoof rule: XFF is honored ONLY when the connection peer
// is loopback/private or explicitly trusted (`FORWARD_AUTH_TRUSTED_PROXIES`) — an untrusted client can
// never spoof its IP via XFF. Reads env once at module init; sealed executor, never @orb/db or a domain.

import { getConnInfo } from "@hono/node-server/conninfo";
import { parseIp } from "@orb/kit/ip";
import type { Context, MiddlewareHandler } from "hono";
import { env } from "#foundation/env";
import { isInRanges, isPrivateOrLoopback } from "./ip-ranges.ts";

const XFF_HEADER = "x-forwarded-for";
const FORBIDDEN = 403;

/** Parse a comma-separated allowlist env value into trimmed CIDR/IP entries (unset/empty ⇒ belt off). */
export function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** `FORWARD_AUTH_TRUSTED_PROXIES`, parsed once at module init. Every forwarded-header read believes the same
 *  hops: `X-Forwarded-For` here and `X-Forwarded-Proto` in `infra/auth/transport.ts`. */
export const TRUSTED_PROXIES = parseAllowlist(env.FORWARD_AUTH_TRUSTED_PROXIES);

/** A hop whose forwarded headers are believed: loopback/private, or inside `trustedProxies`. The ONE predicate
 *  for both the client address and the cookie transport, so the two reads cannot disagree about a peer. */
export function isTrustedHop(ip: string, trustedProxies: readonly string[]): boolean {
  return isPrivateOrLoopback(ip) || isInRanges(ip, trustedProxies);
}

/** Pure peer-vs-XFF precedence. An untrusted peer's XFF is ignored. Behind a trusted peer the list is walked
 *  from the RIGHT, skipping trusted hops, and the first untrusted hop is the client.
 *  @remarks SECURITY: never read the leftmost entry. An appending proxy keeps whatever the client sent on the
 *  left, so a visitor could pick its own address, resetting the per-IP login throttle or passing
 *  `IP_ALLOWLIST` with a private value. Only entries a trusted hop appended are facts. An unparseable entry
 *  ends the walk at the last address a trusted hop vouched for. */
export function resolveClientIp(args: {
  readonly peer: string | undefined;
  readonly forwarded: string | undefined;
  readonly trustedProxies: readonly string[];
}): string | null {
  const { peer, forwarded, trustedProxies } = args;
  if (peer === undefined) {
    return null;
  }
  if (forwarded === undefined || !isTrustedHop(peer, trustedProxies)) {
    return peer;
  }
  let client = peer;
  for (const entry of forwarded.split(",").reverse()) {
    const hop = entry.trim();
    if (parseIp(hop) === null) {
      return client;
    }
    client = hop;
    if (!isTrustedHop(hop, trustedProxies)) {
      return client;
    }
  }
  return client;
}

/** Caller IP for a live request — the per-IP rate-limit key + the allowlist gate's subject. */
export function clientIp(c: Context): string | null {
  return resolveClientIp({
    peer: getConnInfo(c).remote.address,
    forwarded: c.req.header(XFF_HEADER),
    trustedProxies: TRUSTED_PROXIES,
  });
}

const V4_BITS = 32;
const V4_OCTETS = 4;
const OCTET_BASE = 256n;
// 2^64: dividing a 128-bit address by it leaves the /64 prefix.
const V6_PREFIX_DIVISOR = 18_446_744_073_709_551_616n;
const HEX_RADIX = 16;

/** Render a parsed 32-bit address as its dotted quad, so a v4-mapped v6 literal keys like the plain v4 one. */
function dottedQuad(value: bigint): string {
  const octets: string[] = [];
  let rest = value;
  for (let i = 0; i < V4_OCTETS; i++) {
    octets.unshift(String(rest % OCTET_BASE));
    rest /= OCTET_BASE;
  }
  return octets.join(".");
}

/** The per-address throttle key (D259): an IPv4 address as itself, an IPv6 address by its /64 prefix. One host
 *  usually holds a whole /64, so a full-address key lets it rotate addresses and reset its bucket at will. An
 *  unparseable address keys as itself. */
export function addressThrottleKey(ip: string): string {
  const parsed = parseIp(ip);
  if (parsed === null) {
    return ip;
  }
  if (parsed.bits === V4_BITS) {
    return dottedQuad(parsed.value);
  }
  return `${(parsed.value / V6_PREFIX_DIVISOR).toString(HEX_RADIX)}::/64`;
}

/** Raw TCP peer socket address, no XFF precedence — the anti-spoof subject for the forward-header
 *  unsigned trusted-proxy gate (a client can forge XFF/X-Real-IP but never the socket peer).
 *  `undefined` ⇒ unsigned path fails closed. */
export function peerIp(c: Context): string | undefined {
  return getConnInfo(c).remote.address;
}

/** Pure allow decision: loopback/private always allowed; unresolvable ip allowed (belt, not the auth
 *  layer); else must match the allowlist. */
export function isIngressAllowed(ip: string | null, cidrs: readonly string[]): boolean {
  return ip === null || isPrivateOrLoopback(ip) || isInRanges(ip, cidrs);
}

/** Mounted FIRST by `entry/app.ts` when `IP_ALLOWLIST` is set; non-allowed caller gets an empty 403
 *  before any auth work. */
export function ipAllowlistMiddleware(cidrs: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    if (!isIngressAllowed(clientIp(c), cidrs)) {
      return c.body(null, FORBIDDEN);
    }
    return await next();
  };
}
