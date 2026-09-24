// The relay tell: a pure `Headers` predicate, the `csrf.ts` shape. `ownerFallbackAllowed` (dispatch.ts) consumes
// it, so it guards every owner-equivalent grant to an un-credentialed peer: the owner fallback in `resolve`
// and the local first-run password claim with its `localFirstRun` flag (Spine-Identity-and-Auth.md invariant 7).
//
// WHY PRESENCE, NOT VALUE. These headers are attacker-controllable and are never trusted as identity here.
// Nothing in this module parses one or believes an address in one (the trusted client IP, with its own
// peer-precedence rule, is `infra/network/ingress.ts::resolveClientIp`). The signal is narrower and holds in
// the direction that matters: a request carrying one has been relayed, so the socket peer is a forwarder
// speaking for a third party, not the operator's own client. A loopback peer is exactly what a same-host
// tunnel or proxy produces (cloudflared, `tailscale serve`, Caddy or nginx on 127.0.0.1), so the tell refuses
// the loopback peer as well as the widened `AUTH_FALLBACK_TRUSTED_PEERS` ranges. An EMPTY value refuses too.
// A forged tell can only deny its own sender.
//
// THE DEV STACK SENDS NONE. The vite dev proxy (`packages/client/vite.config.ts`) sets only `target` and
// `changeOrigin`; http-proxy writes `x-forwarded-*` only under its `xfwd` option, which nothing in the repo
// sets. Adding `xfwd` there would log the dev owner out of their own box.
//
// IT FAILS OPEN BY CONSTRUCTION. A relay that sends none of these headers (bare nginx `proxy_pass` with no
// `proxy_set_header`) is invisible. The mainstream relays send at least one by default, and `Host` is never a
// trust input, so the closed set below is the whole control.

/** The relay tells, lower-cased (`Headers.has` is case-insensitive). `forwarded` is RFC 7239; `x-real-ip` is
 *  nginx; `cf-connecting-ip` is cloudflared; `x-forwarded-host` and `x-forwarded-proto` are what
 *  `tailscale serve` and most proxies add beside `x-forwarded-for`. */
const FORWARDING_HEADERS: readonly string[] = ["forwarded", "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "x-forwarded-proto", "x-forwarded-host"];

/** True when the request announces a relay hop. Presence is the signal, never the value. */
export function hasForwardingHeader(headers: Headers): boolean {
  return FORWARDING_HEADERS.some((name) => headers.has(name));
}
