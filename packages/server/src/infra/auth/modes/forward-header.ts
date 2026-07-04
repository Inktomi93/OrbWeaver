// `forward-header` (AUTH_MODE=forward-header, behind authentik/authelia forward-auth) — the proxy
// terminates SSO and injects per-request identity headers. Two paths:
//
//   • SIGNED  — verify-on + a forwarded JWT + its JWKS: trust the CLAIMS (cryptographic spoof-proof
//     regardless of network path; skips the source-IP gate — the signature IS the proof).
//   • UNSIGNED — verify-off or no JWT: network-trust of the raw headers (authentik X-Authentik-*,
//     Authelia Remote-*, or a custom-named proxy), guarded by the OPT-IN FORWARD_AUTH_TRUSTED_PROXIES
//     source-IP gate.
//
// FAIL-CLOSED policy (the framing decisions live HERE, testable; the jose crypto is the injected
// `deps.verifyForwardJwt` port — `jose` is deferred to 4e):
//   (1) verify-on + jwt + NO jwks → reject (authentik always injects both; a missing jwks is a
//       stripped/spoofed request — must not fall through to the unsigned path).
//   (2) verify-on + jwt + jwks but EMPTY allowlist → reject (no trusted key source ⇒ no trusted signed
//       path; refuse the request-supplied JWKS rather than mint a self-signed identity).
//   (3)/(5) the injected verifier returns null on bad/non-https/off-allowlist JWKS OR a failed verify.
//   (4) verified but NO preferred_username → reject (refuse to fall through to the unsigned header path
//       with a valid-but-usernameless JWT).
// A present-but-invalid JWT NEVER silently downgrades to the unsigned path — that would defeat the
// cryptographic proof the operator asked for.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { securityEvent } from "#foundation/observability";
import { isInRanges } from "#infra/network";
import type { AuthConfig, ResolveDeps } from "../contract";

// Network-trust header form: authentik joins groups with "|"; tolerate commas too. Top-level
// (useTopLevelRegex — compiled once, not per call).
const GROUP_SEPARATOR = /[|,]/u;

function groupsFromClaim(claim: unknown): string[] {
  if (Array.isArray(claim)) {
    return claim.filter((g): g is string => typeof g === "string");
  }
  if (typeof claim === "string" && claim.length > 0) {
    return claim
      .split(GROUP_SEPARATOR)
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
  }
  return [];
}

/** The request's apparent client IP for the opt-in trusted-proxy gate: the leftmost X-Forwarded-For hop
 *  (Caddy sets it to the real client), falling back to X-Real-IP. null when neither is present. */
function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff !== null) {
    const first = xff.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp !== undefined && realIp.length > 0 ? realIp : null;
}

/** Read an UNSIGNED forwarded identity from the configured/known trusted headers. Order: a custom
 *  override (FORWARD_AUTH_USER_HEADER), then authentik (X-Authentik-*), then Authelia (Remote-*).
 *  Authelia has no stable uid → externalId stays null. Returns null when no known user header is set.
 *  CAST SEAM: every raw header value becomes a branded Handle / ExternalId here. */
function readUnsignedIdentity(headers: Headers, config: AuthConfig): ResolvedIdentity | null {
  if (config.forwardUserHeader !== undefined) {
    const handle = headers.get(config.forwardUserHeader);
    if (handle === null) {
      return null;
    }
    const externalId =
      config.forwardUidHeader !== undefined ? headers.get(config.forwardUidHeader) : null;
    const groups =
      config.forwardGroupsHeader !== undefined
        ? groupsFromClaim(headers.get(config.forwardGroupsHeader))
        : [];
    return {
      externalId: externalId !== null ? castId<ExternalId>(externalId) : null,
      handle: castId<Handle>(handle),
      groups,
    };
  }
  const authentik = headers.get("x-authentik-username");
  if (authentik !== null) {
    const uid = headers.get("x-authentik-uid");
    return {
      externalId: uid !== null ? castId<ExternalId>(uid) : null,
      handle: castId<Handle>(authentik),
      groups: groupsFromClaim(headers.get("x-authentik-groups")),
    };
  }
  const authelia = headers.get("remote-user");
  if (authelia !== null) {
    return {
      externalId: null,
      handle: castId<Handle>(authelia),
      groups: groupsFromClaim(headers.get("remote-groups")),
    };
  }
  return null;
}

/** The SIGNED path: fail-closed points (1)/(2)/(4) framed here; (3)/(5) inside the injected verifier.
 *  Returns the verified identity, or null to fall through to the unsigned path (only when no JWT is
 *  present), or null-as-rejection. Distinguished by the caller via the `jwt === null` check. */
async function resolveSignedJwt(
  jwt: string,
  metaJwks: string | null,
  config: AuthConfig,
  deps: ResolveDeps,
): Promise<ResolvedIdentity | null> {
  if (metaJwks === null) {
    // (1) JWT without its JWKS — a stripped/spoofed request. Reject (do NOT fall through).
    securityEvent(
      "jwt_no_jwks",
      {},
      "security: forwarded JWT present without its JWKS — rejecting (possible stripped/spoofed request)",
    );
    return null;
  }
  if (config.jwksAllowlist.length === 0) {
    // (2) verify-on but no trusted key source — refuse the request-supplied JWKS entirely.
    securityEvent(
      "jwt_no_allowlist",
      {},
      "security: JWT verification on but no JWKS allowlist/issuer configured — refusing the request-supplied JWKS",
    );
    return null;
  }
  if (deps.verifyForwardJwt === undefined) {
    // No crypto verifier wired but verification was requested — fail closed.
    securityEvent(
      "jwt_no_verifier",
      {},
      "security: JWT verification on but no verifier injected — rejecting forwarded identity",
    );
    return null;
  }
  const claims = await deps.verifyForwardJwt.verify({
    jwt,
    metaJwks,
    allowlist: config.jwksAllowlist,
    ...(config.jwtIssuer !== undefined ? { issuer: config.jwtIssuer } : {}),
    ...(config.jwtAudience !== undefined ? { audience: config.jwtAudience } : {}),
  });
  if (claims === null) {
    return null; // (3)/(5): bad JWKS or a failed/throwing verify → rejected.
  }
  if (claims.handle === undefined || claims.handle.length === 0) {
    // (4) verified but no preferred_username — refuse to fall through to the unsigned path.
    securityEvent(
      "jwt_no_username",
      {},
      "security: forwarded JWT verified but has no preferred_username claim — rejecting",
    );
    return null;
  }
  return {
    externalId: claims.externalId !== null ? castId<ExternalId>(claims.externalId) : null,
    handle: castId<Handle>(claims.handle),
    groups: claims.groups,
  };
}

/** The UNSIGNED path: the raw trusted headers + the opt-in source-IP gate. */
function resolveUnsignedHeader(headers: Headers, config: AuthConfig): ResolvedIdentity | null {
  const identity = readUnsignedIdentity(headers, config);
  if (identity === null) {
    return null;
  }
  // OPT-IN source-IP gate: when FORWARD_AUTH_TRUSTED_PROXIES is set, the forwarded client IP must fall
  // inside it. Unset ⇒ skip (network-isolation trust). A request reaching the app from outside the
  // trusted ranges can't then forge Remote-User.
  if (config.forwardTrustedProxies.length > 0) {
    const ip = clientIpFromHeaders(headers);
    if (ip === null || !isInRanges(ip, config.forwardTrustedProxies)) {
      securityEvent(
        "forwarded_ip_rejected",
        { ip, handle: identity.handle },
        "security: forwarded identity from an untrusted source IP — rejecting",
      );
      return null;
    }
  }
  return identity;
}

export function resolveForwardHeader(
  headers: Headers,
  config: AuthConfig,
  deps: ResolveDeps,
): Promise<ResolvedIdentity | null> {
  const jwt = headers.get("x-authentik-jwt");
  if (config.verifyForwardJwt && jwt !== null) {
    // The signed path OWNS the decision once a JWT is present + verification is on: a present-but-invalid
    // JWT is rejected (returns null here) and must NOT fall through to the unsigned path.
    return resolveSignedJwt(jwt, headers.get("x-authentik-meta-jwks"), config, deps);
  }
  return Promise.resolve(resolveUnsignedHeader(headers, config));
}
