// The AUTH_MODE dispatcher — ONE branch point via the `MODE_RESOLVERS` Record (invariant #4: exhaustive
// over `AuthConfig["mode"]` — a 5th mode that isn't mapped fails `tsc`). Each resolver produces a pre-row
// `ResolvedIdentity | null` (NO `userId`, NO `role` — invariant #3); modes never import each other. Plus
// the peer-gated owner-fallback predicate.
//
// PEER-GATED FALLBACK (load-bearing safety, #298 f2 / re-gate 2026-08-19). The un-credentialed owner
// fallback is granted ONLY when the raw TCP peer is LOOPBACK — the ONE rule across all four modes,
// `single-user` included. The credential is the unspoofable socket peer, NEVER the client-supplied `Host`
// header: a `Host:` a caller writes is not a fact about the network, so the old Host/trusted-ranges gate
// (`isLocalOrigin`) handed owner to anyone who could reach the port and forge `Host: 10.x.x.x` — and a
// vite/proxy `changeOrigin` could launder a LAN request into a loopback-looking Host and re-open it even
// after narrowing. Gating on the peer closes both: every proxied request (peer = the docker/Caddy bridge)
// is denied the fallback, so SSO is mandatory on the FQDN and on any LAN hostname Caddy fronts, while all
// loopback dev tooling (snap/e2e/curl harvests, the vite proxy's `changeOrigin` path) is unaffected.
// `resolve` (index.ts) still tests `fallback === "owner"` BEFORE consulting this, so `single-user` + `deny`
// authenticates nobody (boot-fatal in `foundation/env`, since this fallback is single-user's only
// credential; a LOOPBACK peer is exactly what keeps that credential — and SSH break-glass — open).

import { isInRanges } from "#infra/network";
import type { AuthConfig, ModeResolver } from "./contract.ts";
import { resolveForwardHeader } from "./modes/forward-header.ts";
import { resolveLocal } from "./modes/local.ts";
import { resolveOidc } from "./modes/oidc.ts";
import { resolveSingleUser } from "./modes/single-user.ts";

/** Loopback only — the peer ranges that admit the un-credentialed owner fallback. NOT the wider
 *  `DEFAULT_TRUSTED_RANGES` (RFC1918/CGNAT/link-local): a private-but-non-loopback peer is a LAN device or
 *  a proxy hop, and must authenticate. `isInRanges` reduces an IPv4-mapped peer (`::ffff:127.0.0.1`) to its
 *  v4 value, so it matches `127.0.0.0/8`. */
const LOOPBACK_RANGES: readonly string[] = ["127.0.0.0/8", "::1/128"];

/**
 * The ONE dispatch point: one entry per `AuthConfig["mode"]`. The mapped-type `Record` makes a missing
 * arm a `tsc` error (invariant #4 — exhaustive dispatch). `single-user` resolves to `null` (the
 * peer-gated owner fallback in `resolve` takes over); the cookie modes share the validate path; only
 * `forward-header` does header/JWT verification.
 */
export const MODE_RESOLVERS: Record<AuthConfig["mode"], ModeResolver> = {
  "single-user": resolveSingleUser,
  local: resolveLocal,
  oidc: resolveOidc,
  "forward-header": resolveForwardHeader,
};

/**
 * Whether the request's PEER permits the un-credentialed owner fallback: true iff the raw TCP peer socket
 * address is loopback — ONE rule for every mode (`single-user` included; there is no origin/mode branch any
 * more). An `undefined` peer FAILS CLOSED — a transport that cannot resolve one gets no fallback. (Until
 * #1193 this parenthetical also named the debug gate's own `isAdmin`, which re-resolved identity without a
 * peer; that second resolution is gone — the gate now judges the principal the request middleware already
 * minted WITH the peer, which is why it had been refusing the box operator.) The `AUTH_FALLBACK` knob is the
 * caller's (`resolve`, index.ts), which short-circuits on `fallback !== "owner"` before consulting this.
 */
export function ownerFallbackAllowed(peerIp: string | undefined): boolean {
  return peerIp !== undefined && isInRanges(peerIp, LOOPBACK_RANGES);
}
