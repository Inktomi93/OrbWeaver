// The per-request cookie TRANSPORT and CLIENT SCOPE. The app never terminates TLS, so `https` is only ever a
// trusted proxy's assertion. It picks the session cookie (`modes/cookie-session.ts`) and the OIDC callback
// scheme, so the two cannot disagree.
//
// WHY A HEADER MAY DECIDE THIS. A forged `X-Forwarded-Proto` reaches only its sender's own request: a browser
// cannot attach a custom header to another user's navigation (a preflight this app never grants). The peer
// must be a trusted hop (`isTrustedHop`, the SAME predicate the `X-Forwarded-For` read uses), so a direct
// public visitor's claim is ignored. A trusted-peer sender that forges `https` over plain http gets a `Secure`
// cookie its own browser drops. A forged `http` appended behind a proxy's `https` fails the every-value rule
// and downgrades only the forger's own session. The operator-side failure is a TLS proxy that sends no
// `X-Forwarded-Proto`: the box then mints the http cookie over https. Boot cannot see that; the login notice
// shows "plain http" on an https page.

import type { ClientScope, RequestTransport } from "@orb/contracts/identity";
import type { Context } from "hono";
import { securityEvent } from "#foundation/observability";
import { clientIp, isInRanges, isPrivateOrLoopback, isTrustedHop, peerIp, TRUSTED_PROXIES } from "#infra/network";
import type { PublicHttpMintNotice } from "./contract.ts";
import { createKeyedNoticeThrottle } from "./notice-throttle.ts";

const X_FORWARDED_PROTO = "x-forwarded-proto";
const HTTPS: RequestTransport = "https";
const UNKNOWN_CLIENT = "unknown";
// A client on this machine: nothing it sends crosses a network, whatever the transport. A relay on this machine
// lands here too, and it forwards visitors whose own leg is the relay's TLS.
const LOOPBACK_RANGES: readonly string[] = ["127.0.0.0/8", "::1/128"];

/** Pure transport rule: `https` iff the peer is a trusted hop and EVERY `X-Forwarded-Proto` value is `https`. */
export function resolveTransport(args: {
  readonly peer: string | undefined;
  readonly forwardedProto: string | null | undefined;
  readonly trustedProxies: readonly string[];
}): RequestTransport {
  const { peer, forwardedProto, trustedProxies } = args;
  if (peer === undefined || forwardedProto === null || forwardedProto === undefined || !isTrustedHop(peer, trustedProxies)) {
    return "http";
  }
  return forwardedProto.split(",").every((value) => value.trim().toLowerCase() === HTTPS) ? "https" : "http";
}

/** The transport of a live request. */
export function requestTransport(c: Context): RequestTransport {
  return resolveTransport({ peer: peerIp(c), forwardedProto: c.req.raw.headers.get(X_FORWARDED_PROTO), trustedProxies: TRUSTED_PROXIES });
}

/** Pure scope rule over the resolved client address. Only a warning rides on it, so an unresolved address
 *  takes the direction that warns. */
export function resolveClientScope(ip: string | null): ClientScope {
  if (ip === null) {
    return "public";
  }
  if (isInRanges(ip, LOOPBACK_RANGES)) {
    return "loopback";
  }
  return isPrivateOrLoopback(ip) ? "private" : "public";
}

/** The scope of a live request's resolved client (`X-Forwarded-For`-aware behind a trusted hop). */
export function requestClientScope(c: Context): ClientScope {
  return resolveClientScope(clientIp(c));
}

/** The unthrottled line: what the mint routes emit when no throttled notice is injected. */
export function reportPublicHttpMint(ip: string | null): void {
  securityEvent(
    "session_minted_over_public_http",
    { clientIp: ip },
    "security: a password and session cookie were sent in clear from the public internet; put TLS or a tunnel in front",
  );
}

/** One line per client address per hour. `now` is the composition root's clock. */
export function createPublicHttpMintNotice(now: () => number): PublicHttpMintNotice {
  const throttle = createKeyedNoticeThrottle(now);
  return (ip) => {
    throttle(ip ?? UNKNOWN_CLIENT, () => {
      reportPublicHttpMint(ip);
    });
  };
}
