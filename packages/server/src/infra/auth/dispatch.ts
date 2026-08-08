// The AUTH_MODE dispatcher — ONE branch point via the `MODE_RESOLVERS` Record (invariant #4: exhaustive
// over `AuthConfig["mode"]` — a 5th mode that isn't mapped fails `tsc`). Each resolver produces a pre-row
// `ResolvedIdentity | null` (NO `userId`, NO `role` — invariant #3); modes never import each other. Plus
// the origin-gated owner-fallback predicate.
//
// ORIGIN-GATED FALLBACK (load-bearing safety): in any SSO mode the owner fallback is granted ONLY for a
// LOCAL origin (the raw-LAN-IP path). On the public FQDN an un-credentialed request resolves to nothing
// (→ 401), making SSO mandatory. WITHOUT this gate, oidc+owner would hand every anonymous public request
// owner. In `single-user` the ORIGIN test is unconditional — but read that as "unconditional GIVEN
// `AUTH_FALLBACK=owner`": `resolve` (index.ts) tests `fallback === "owner"` BEFORE ever calling here, so
// `single-user` + `deny` authenticates nobody. That pair is now boot-fatal (`foundation/env`), because
// single-user's ONLY credential is this fallback. `isLocalOrigin` reads `Host` (NOT `X-Forwarded-Host`)
// deliberately — a proxy-rewritten Host can only REMOVE trust, never grant it.

import { DEFAULT_TRUSTED_RANGES, isInRanges } from "#infra/network";
import type { AuthConfig, ModeResolver } from "./contract.ts";
import { normalizeHost } from "./host.ts";
import { resolveForwardHeader } from "./modes/forward-header.ts";
import { resolveLocal } from "./modes/local.ts";
import { resolveOidc } from "./modes/oidc.ts";
import { resolveSingleUser } from "./modes/single-user.ts";

const LOCALHOST = "localhost";

/**
 * The ONE dispatch point: one entry per `AuthConfig["mode"]`. The mapped-type `Record` makes a missing
 * arm a `tsc` error (invariant #4 — exhaustive dispatch). `single-user` resolves to `null` (the
 * unconditional owner fallback in `resolve` takes over); the cookie modes share the validate path; only
 * `forward-header` does header/JWT verification.
 */
export const MODE_RESOLVERS: Record<AuthConfig["mode"], ModeResolver> = {
  "single-user": resolveSingleUser,
  local: resolveLocal,
  oidc: resolveOidc,
  "forward-header": resolveForwardHeader,
};

/**
 * Whether the request's ORIGIN permits the un-credentialed owner fallback. `single-user`: always (the
 * only way in). SSO modes: only on a local origin — the gate that keeps oidc+owner from handing anonymous
 * public requests owner.
 *
 * This answers the ORIGIN question only. The `AUTH_FALLBACK` knob is the caller's (`resolve`, index.ts),
 * which short-circuits on `fallback !== "owner"` before consulting this — so "always" here is never
 * "always" end-to-end.
 */
export function ownerFallbackAllowed(headers: Headers, config: AuthConfig): boolean {
  if (config.mode === "single-user") {
    return true;
  }
  return isLocalOrigin(headers, config.trustedLocalHosts, config.trustedPrivateRanges);
}

/**
 * True when the request targets a trusted local origin: a private/loopback IP literal, `localhost`, or
 * a configured trusted hostname. Reads `Host` (not `X-Forwarded-Host`) deliberately. Fails closed (a
 * hostname that won't parse as an IP → no match → SSO required).
 */
export function isLocalOrigin(headers: Headers, trustedHosts: readonly string[], extraRanges: readonly string[] = []): boolean {
  const rawHost = headers.get("host");
  if (rawHost === null) {
    return false;
  }
  const host = normalizeHost(rawHost);
  if (host.length === 0) {
    return false;
  }
  if (host === LOCALHOST) {
    return true;
  }
  if (trustedHosts.includes(host)) {
    return true;
  }
  // env-extra CIDRs widen the built-in set without replacing it.
  const ranges = extraRanges.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extraRanges] : DEFAULT_TRUSTED_RANGES;
  return isInRanges(host, ranges);
}
