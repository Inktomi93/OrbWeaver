// infra/network/ingress — the ingress network edge belt (core/Tier-3-Infra.md §"The ingress IP allowlist";
// PD-91 — extracted from the inline entry/app.ts implementation once `@hono/node-server/conninfo` was in
// the workspace). Three surfaces:
//   • `parseAllowlist` — the comma-separated env floor → trimmed CIDR/IP entries (shared by the
//     IP_ALLOWLIST + FORWARD_AUTH_TRUSTED_PROXIES parses).
//   • `clientIp(c)` — the peer-vs-XFF trust precedence (the PD-52 anti-spoof rule: `x-forwarded-for` is
//     honored ONLY when the connection peer is loopback/private OR explicitly listed in
//     `FORWARD_AUTH_TRUSTED_PROXIES` — an untrusted client can never spoof its IP via XFF). Reused by the
//     tRPC seam (`Context.clientIp` — the per-IP rate-limit key) and the allowlist gate below.
//   • `ipAllowlistMiddleware(cidrs)` — the blunt network gate mounted in FRONT of everything (a 403
//     before any auth work); loopback/private is always allowed (the operator's own box).
// Reads foundation/env DOWN ONCE at module init (the egress-firewall precedent; zero per-request cost).
// A sealed executor: hono + node-server + the local CIDR matcher — NEVER @orb/db or a domain.

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { env } from "#foundation/env";
import { isInRanges, isPrivateOrLoopback } from "./ip-ranges";

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

/** The XFF-trusting proxy set — built once at module init (PD-52: never rebuilt per request). */
const TRUSTED_PROXIES = parseAllowlist(env.FORWARD_AUTH_TRUSTED_PROXIES);

/**
 * The PURE peer-vs-XFF precedence (the testable core of {@link clientIp}): the leftmost `x-forwarded-for`
 * hop wins ONLY when the connection peer is a trusted proxy (loopback/private or in `trustedProxies`);
 * otherwise the peer itself is the caller. An untrusted peer's XFF is ignored — spoof-proof (PD-52).
 */
export function resolveClientIp(args: {
  readonly peer: string | undefined;
  readonly forwarded: string | undefined;
  readonly trustedProxies: readonly string[];
}): string | null {
  const { peer, forwarded, trustedProxies } = args;
  if (
    forwarded !== undefined &&
    forwarded.length > 0 &&
    peer !== undefined &&
    (isPrivateOrLoopback(peer) || isInRanges(peer, trustedProxies))
  ) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  return peer ?? null;
}

/** Derive the caller IP for a live request (the per-IP rate-limit key + the allowlist gate's subject). */
export function clientIp(c: Context): string | null {
  return resolveClientIp({
    peer: getConnInfo(c).remote.address,
    forwarded: c.req.header(XFF_HEADER),
    trustedProxies: TRUSTED_PROXIES,
  });
}

/**
 * The RAW TCP peer socket address — the immediate connection's remote address, straight from conninfo with
 * NO XFF precedence. This is the anti-spoof subject for the forward-header UNSIGNED trusted-proxy gate: a
 * client can forge `X-Forwarded-For`/`X-Real-IP`, but never the socket peer. Distinct from {@link clientIp},
 * which resolves the XFF-derived CLIENT *behind* a trusted proxy; here we want the PROXY/peer identity
 * itself, to answer "did this request arrive FROM a trusted proxy?". `undefined` when the transport exposes
 * no conninfo (→ the unsigned path fails closed). Threaded to the auth seam by `entry/app.ts`.
 */
export function peerIp(c: Context): string | undefined {
  return getConnInfo(c).remote.address;
}

/**
 * The PURE allow decision (the testable core of {@link ipAllowlistMiddleware}): loopback/private is
 * always allowed (the operator's own box); an unresolvable ip is allowed (the gate is a belt, not the
 * auth layer — identity still gates below); anything else must match the allowlist.
 */
export function isIngressAllowed(ip: string | null, cidrs: readonly string[]): boolean {
  return ip === null || isPrivateOrLoopback(ip) || isInRanges(ip, cidrs);
}

/**
 * The ingress IP-allowlist gate — mounted FIRST by `entry/app.ts` when `IP_ALLOWLIST` is set (the belt is
 * off otherwise; orthogonal to AUTH_MODE). A non-allowed caller gets an empty 403 before any auth work.
 */
export function ipAllowlistMiddleware(cidrs: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    if (!isIngressAllowed(clientIp(c), cidrs)) {
      return c.body(null, FORBIDDEN);
    }
    return await next();
  };
}
