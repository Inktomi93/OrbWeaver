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
//
// A RELAYED REQUEST IS NEVER THE OPERATOR. A same-host tunnel or proxy connects over loopback, so the peer
// alone would make every visitor behind it the owner. The predicate takes the request `Headers` and refuses
// any request carrying a relay tell (`forwarded.ts`), on every peer, loopback included. `Headers` is a
// required parameter so no caller can ask the peer question without the relay question.
//
// THE OPT-IN WIDENING (`AUTH_FALLBACK_TRUSTED_PEERS`, PROPOSED — docs/plans/containerize/design.md arm
// (b)). The loopback rule above is correct on bare metal and unusable in a container: docker's port
// publication SNATs every inbound connection to the bridge gateway, so a published port never delivers a
// loopback peer and `single-user` 401s every browser request. A deployer may name extra CIDR ranges, which
// this predicate admits IN ADDITION to loopback. UNSET IS THE DEFAULT and changes nothing. What setting it
// actually grants — and why `IP_ALLOWLIST` does not bound it — is `foundation/env/fallback-peers.ts`; read
// that before recommending it to anyone.

import { isInRanges } from "#infra/network";
import type { AuthConfig, ModeResolver } from "./contract.ts";
import { hasForwardingHeader } from "./forwarded.ts";
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
 * Whether this request may be treated as the box operator without a credential: true iff the request carries
 * no relay tell ({@link hasForwardingHeader}) AND the raw TCP peer socket address is loopback or inside one of
 * the operator's opted-in `trustedPeers` ranges. ONE rule for every mode, `single-user` included. An
 * `undefined` peer fails closed: a transport that cannot resolve one gets no fallback, and a widened set is
 * never a way to lose that requirement. The `AUTH_FALLBACK` knob is the caller's (`resolve`, index.ts), which
 * short-circuits on `fallback !== "owner"` before consulting this.
 *
 * `trustedPeers` DEFAULTS TO EMPTY, and the default is the loopback-only rule. Omitting it is therefore always
 * the SAFE direction, which is why the two first-run call sites (`entry/lifecycle.ts`) pass nothing on
 * purpose; read the note there before "fixing" them.
 */
export function ownerFallbackAllowed(peerIp: string | undefined, headers: Headers, trustedPeers: readonly string[] = []): boolean {
  if (peerIp === undefined || hasForwardingHeader(headers)) {
    return false;
  }
  return isInRanges(peerIp, LOOPBACK_RANGES) || isInRanges(peerIp, trustedPeers);
}
