// The AUTH_MODE dispatcher — ONE branch point over `config.mode`, exhaustive via `assertNever` (a 5th
// mode that isn't handled fails `tsc`). Modes never import each other; they meet only here. Plus the
// origin-gated owner-fallback predicate.
//
// ORIGIN-GATED FALLBACK (load-bearing safety): in any SSO mode the owner fallback is granted ONLY for a
// LOCAL origin (the raw-LAN-IP path). On the public FQDN an un-credentialed request resolves to nothing
// (→ 401), making SSO mandatory. WITHOUT this gate, oidc+owner would hand every anonymous public request
// owner. In `single-user` the fallback is unconditional (the only way in). `isLocalOrigin` reads `Host`
// (NOT `X-Forwarded-Host`) deliberately — a proxy-rewritten Host can only REMOVE trust, never grant it.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { DEFAULT_TRUSTED_RANGES, isInRanges } from "#infra/network";
import type { AuthConfig, ResolveDeps, ValidatedSession } from "./contract";
import { normalizeHost } from "./host";
import { resolveForwardHeader } from "./modes/forward-header";
import { resolveLocal } from "./modes/local";
import { resolveOidc } from "./modes/oidc";
import { resolveSingleUser } from "./modes/single-user";

const LOCALHOST = "localhost";

/**
 * What the per-mode dispatch resolves to, BEFORE the owner-fallback step (file-local — an infra-internal
 * shape, never a boundary type):
 *   - `session`  — a live cookie session (the row id + role already resolved): `local`/`oidc`.
 *   - `identity` — a pre-row SSO identity needing an upsert to mint a `userId`: `forward-header`.
 *   - `none`     — nothing resolved → the owner-fallback step decides (`single-user`, or an
 *                  anonymous/invalid request under any mode).
 */
type ModeOutcome =
  | { kind: "session"; session: ValidatedSession }
  | { kind: "identity"; identity: ResolvedIdentity }
  | { kind: "none" };

/** Compile-time exhaustiveness guard: a `config.mode` the switch doesn't handle makes this argument
 *  non-`never`, a `tsc` error (exhaustive-dispatch). */
function assertNever(value: never): never {
  throw new Error(`Unhandled AUTH_MODE: ${String(value)}`);
}

/**
 * Run the mode-specific resolver for `config.mode` and shape the result into a `ModeOutcome`:
 *   - cookie modes (`local`/`oidc`) → a `session` (the row id + role already resolved) or `none`.
 *   - `forward-header` → a pre-row `identity` (needs an upsert to mint a userId) or `none`.
 *   - `single-user` → always `none` (the unconditional owner fallback takes over).
 */
export async function dispatchMode(
  headers: Headers,
  config: AuthConfig,
  deps: ResolveDeps,
): Promise<ModeOutcome> {
  switch (config.mode) {
    case "single-user": {
      resolveSingleUser();
      return { kind: "none" };
    }
    case "local": {
      const session = await resolveLocal(headers, deps);
      return session !== null ? { kind: "session", session } : { kind: "none" };
    }
    case "oidc": {
      const session = await resolveOidc(headers, deps);
      return session !== null ? { kind: "session", session } : { kind: "none" };
    }
    case "forward-header": {
      const identity = await resolveForwardHeader(headers, config, deps);
      return identity !== null ? { kind: "identity", identity } : { kind: "none" };
    }
    default:
      return assertNever(config.mode);
  }
}

/**
 * Whether the un-credentialed owner fallback may be granted. `single-user`: always (the only way in).
 * SSO modes: only on a local origin — the gate that keeps oidc+owner from handing anonymous public
 * requests owner.
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
export function isLocalOrigin(
  headers: Headers,
  trustedHosts: readonly string[],
  extraRanges: readonly string[] = [],
): boolean {
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
  const ranges =
    extraRanges.length > 0 ? [...DEFAULT_TRUSTED_RANGES, ...extraRanges] : DEFAULT_TRUSTED_RANGES;
  return isInRanges(host, ranges);
}
