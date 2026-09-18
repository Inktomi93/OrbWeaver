// The PROXY-HOP TELL — a pure `Headers` predicate, the `csrf.ts` shape. Its ONE consumer is `resolve`
// (index.ts), which uses it as the belt on the WIDENED owner-fallback peer set
// (`AUTH_FALLBACK_TRUSTED_PEERS`, `foundation/env/fallback-peers.ts`).
//
// WHY PRESENCE, NOT VALUE. These headers are attacker-controllable and are never trusted as identity here —
// nothing in this module parses one or believes an address in one (the IP that IS trusted, with its own
// peer-precedence rule, is `infra/network/ingress.ts::resolveClientIp`). The signal is narrower and
// unforgeable in the direction that matters: a request carrying one has been RELAYED, so the socket peer is
// a forwarder speaking for a third party rather than the operator's own on-box client. The widened arm's
// whole premise is "this peer IS the deployer"; a proxy hop announcing itself falsifies that premise, so the
// arm is refused. An EMPTY value refuses too — a proxy that sets `X-Forwarded-For:` with nothing in it has
// still relayed the request.
//
// IT FAILS OPEN BY CONSTRUCTION AND THAT IS UNDERSTOOD: a relaying proxy that STRIPS these headers is
// invisible here, so this belt narrows the widened arm, it does not make it safe. The control that bounds
// the widening is the deployment's own port publication (`fallback-peers.ts`), and this belt exists to catch
// the common accident — a container-fronted Caddy/nginx/Traefik, all of which set at least one of these by
// default — not a determined laundering setup.
//
// THE LOOPBACK ARM IS DELIBERATELY NOT BELTED. A same-host proxy forwarding over 127.0.0.1 is a RECORDED,
// ACCEPTED shape (containerize-prod-image-spec.md §4 topology (b), fenced by the prod SSO boot-fatal), and
// the dev stack's own vite proxy sets `X-Forwarded-For` on every request it relays to the app — belting the
// loopback arm here would silently log the dev owner out of their own box. Changing that is a ruling, not a
// tightening.

/** The three relay tells, lower-cased (`Headers.has` is case-insensitive; these are spelled lower for the
 *  reader). `x-forwarded-for` (de-facto), `forwarded` (RFC 7239), `x-real-ip` (nginx). Adding a member is a
 *  behaviour change to the widened arm and belongs with its test. */
const FORWARDING_HEADERS: readonly string[] = ["x-forwarded-for", "forwarded", "x-real-ip"];

/** True when the request announces a proxy hop. See the header note: presence is the signal, never the value. */
export function hasForwardingHeader(headers: Headers): boolean {
  return FORWARDING_HEADERS.some((name) => headers.has(name));
}
