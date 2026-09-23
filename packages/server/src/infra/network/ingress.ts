// Ingress IP-allowlist belt. Anti-spoof rule: XFF is honored ONLY when the connection peer
// is loopback/private or explicitly trusted (`FORWARD_AUTH_TRUSTED_PROXIES`) — an untrusted client can
// never spoof its IP via XFF. Reads env once at module init; sealed executor, never @orb/db or a domain.

import { getConnInfo } from "@hono/node-server/conninfo";
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

/** XFF-trusting proxy set — built once at module init (never rebuilt per request). */
const TRUSTED_PROXIES = parseAllowlist(env.FORWARD_AUTH_TRUSTED_PROXIES);

/** Pure peer-vs-XFF precedence: leftmost XFF hop wins only when the peer is trusted; untrusted peer's
 *  XFF is ignored (spoof-proof). */
export function resolveClientIp(args: {
  readonly peer: string | undefined;
  readonly forwarded: string | undefined;
  readonly trustedProxies: readonly string[];
}): string | null {
  const { peer, forwarded, trustedProxies } = args;
  if (forwarded !== undefined && forwarded.length > 0 && peer !== undefined && (isPrivateOrLoopback(peer) || isInRanges(peer, trustedProxies))) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  return peer ?? null;
}

/** Caller IP for a live request — the per-IP rate-limit key + the allowlist gate's subject. */
export function clientIp(c: Context): string | null {
  return resolveClientIp({
    peer: getConnInfo(c).remote.address,
    forwarded: c.req.header(XFF_HEADER),
    trustedProxies: TRUSTED_PROXIES,
  });
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
