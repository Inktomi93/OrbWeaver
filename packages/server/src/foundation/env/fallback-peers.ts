// The OWNER-FALLBACK PEER-SET posture — `AUTH_FALLBACK_TRUSTED_PEERS`, the documented, non-default opt-in
// that widens the un-credentialed owner fallback's peer set (containerize-prod-image-spec.md §3.1 arm (b)).
// Pure (raw values injected, no `process.env` read here), the `bind.ts` / `diagnostics.ts` shape: a parse, a
// resolver, and a warning list, all unit-testable. `foundation/env` owns the ONE process.env read and calls
// this with its parsed floor; `entry/lifecycle` logs the warning; `infra/auth/config` reads the same parse
// into `AuthConfig.fallbackTrustedPeers` so the rule has ONE spelling.
//
// ── WHY THE KNOB EXISTS ──────────────────────────────────────────────────────────────────────────────────
// Since #298 f2 the fallback admits a LOOPBACK TCP peer only (`infra/auth/dispatch.ts`). That is correct on
// bare metal and UNUSABLE in a container: docker's port publication SNATs every inbound connection to the
// bridge gateway (`172.17.0.1`-class), and a fronting proxy in its own container arrives as a bridge address
// too — so `docker compose up` + `AUTH_MODE=single-user` authenticates NOBODY and 401s every browser request,
// because single-user's ONLY credential is that fallback. The knob is the deployer's explicit acceptance of a
// wider peer set in exchange for a usable box.
//
// ── WHAT SETTING IT ACTUALLY GRANTS (read this before recommending it) ───────────────────────────────────
// Every peer inside a named range becomes the OWNER with no credential. Under docker's NAT that is not a
// statement about a trusted machine — it is a statement about a SOCKET. With `-p 8788:8788` (all interfaces)
// every client on the LAN or the internet reaches the app AS the bridge gateway, so naming the bridge range
// means "anyone who can reach the published port is the owner": the pre-#298 world-owner shape, re-opened on
// purpose. The control that actually bounds it is the HOST-SIDE publication (`-p 127.0.0.1:8788:8788`), not
// `IP_ALLOWLIST` — `isIngressAllowed` (`infra/network/ingress.ts`) admits every private address, which is
// exactly what the NAT produces, so the perimeter ring cannot see past the gateway. The warning says so.
//
// ── THE THREE BELTS THAT SURVIVE ─────────────────────────────────────────────────────────────────────────
//   1. `AUTH_FALLBACK=owner` is still tested FIRST (`infra/auth/index.ts::resolve`), so `deny` makes the knob
//      inert and the prod SSO boot-fatal keeps it unreachable in every SSO mode without break-glass.
//   2. The WIDENED arm is refused when the request carries a forwarding header (`infra/auth/forwarded.ts`) —
//      a proxy hop announcing itself means the peer represents someone else. The LOOPBACK arm is untouched
//      (its same-host-proxy hazard is the recorded, accepted shape of spec §4).
//   3. The knob is LAUNCH-ONLY (#301, generalized in `index.ts`): a `.env` pin is boot-fatal, and it may not
//      be combined with `AUTH_BREAK_GLASS` (which is defined as the brief ON-BOX recovery door).
// What it does NOT reach: the local-mode first-run owner-password gate and its `localFirstRun` probe stay
// LOOPBACK-ONLY (`entry/lifecycle.ts`) — they consult no `AUTH_FALLBACK`, so widening them would grant an
// un-credentialed owner-password claim on a `deny` box. A containerized local deploy uses
// `LOCAL_INITIAL_PASSWORD` instead (spec §3.2, already its documented state).

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface OwnerFallbackPeerInput {
  /** `AUTH_FALLBACK` — the knob `resolve` tests BEFORE the peer gate; `deny` makes this set unreachable. */
  readonly authFallback: "owner" | "deny";
  /** `AUTH_FALLBACK_TRUSTED_PEERS` — the raw comma CIDR list, or `undefined` when unset (the default). */
  readonly trustedPeers: string | undefined;
}

/** The composed posture. Both fields are facts about this boot, safe to print in a boot log. */
export interface OwnerFallbackPeerPosture {
  /** The parsed CIDR entries, reported even when `AUTH_FALLBACK=deny` makes them inert — a misconfigured
   *  deploy stays legible. */
  readonly ranges: readonly string[];
  /** True only when the widened set can actually admit somebody: ranges present AND the fallback enabled.
   *  This is what the warning and the /api/_debug credential rule (`diagnostics.ts`) key on. */
  readonly widened: boolean;
}

/** The ONE parse for this knob — `infra/auth/config.ts` imports it rather than re-spelling a CSV split, so
 *  the ranges the boot warning names and the ranges the gate matches can never drift. Trimmed, empties
 *  dropped: `AUTH_FALLBACK_TRUSTED_PEERS=""` is honestly "unset", never "trust nothing-shaped". */
export function parseOwnerFallbackTrustedPeers(raw: string | undefined): readonly string[] {
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function resolveOwnerFallbackPeers(input: OwnerFallbackPeerInput): OwnerFallbackPeerPosture {
  const ranges = parseOwnerFallbackTrustedPeers(input.trustedPeers);
  return { ranges, widened: ranges.length > 0 && input.authFallback === "owner" };
}

/** The operator-facing lines — EMPTY when nothing needs saying, so a healthy boot is silent (the
 *  `diagnostics.ts` contract). The one standing warning is the widening itself: it re-opens, deliberately,
 *  the exact property #298 f2 removed, so it should keep announcing itself for as long as it is true — and
 *  it names the ranges back to the operator, because a typo'd CIDR silently matches nothing and a too-broad
 *  one silently matches everything. */
export function ownerFallbackPeerWarnings(posture: OwnerFallbackPeerPosture): readonly string[] {
  if (!posture.widened) {
    return [];
  }
  return [
    `AUTH_FALLBACK_TRUSTED_PEERS is set to [${posture.ranges.join(", ")}] — every peer inside those ranges is the ` +
      "OWNER of this box with NO credential, no login and no session, on every surface the owner reaches. " +
      "Under docker this is a statement about a SOCKET, not a machine: a published port SNATs every client to " +
      "the bridge gateway, so naming a bridge range while the port is published on all interfaces makes anyone " +
      "who can reach that port the owner. Publish to the host's loopback only (`-p 127.0.0.1:8788:8788`) — " +
      "IP_ALLOWLIST does NOT bound this (it admits every private address, which is what the NAT produces). " +
      "Unset the knob and use an SSO mode (AUTH_MODE=oidc/local/forward-header) for any deployment more than " +
      "one person can reach.",
  ];
}
