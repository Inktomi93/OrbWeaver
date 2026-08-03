// AUTH_MODE=forward-header, behind authentik/authelia forward-auth. SIGNED path (JWT+JWKS present):
// trusts claims cryptographically, skips the IP gate. UNSIGNED path: trusts raw identity headers, gated
// fail-closed on an explicit FORWARD_AUTH_TRUSTED_PROXIES allowlist matched against the TCP peer IP (not
// the spoofable X-Forwarded-For/X-Real-IP) — else any client reaching the socket could forge identity. A
// present-but-invalid JWT never falls through to the unsigned path.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { securityEvent } from "#foundation/observability";
import { isInRanges } from "#infra/network";
import type { AuthConfig, ResolveDeps } from "../contract.ts";

// authentik joins groups with "|"; tolerate commas too.
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

// Order: custom override, then authentik, then Authelia, then generic X-Forwarded-User. Returns null
// when no known user header is set.
function readUnsignedIdentity(headers: Headers, config: AuthConfig): ResolvedIdentity | null {
  if (config.forwardUserHeader !== undefined) {
    const handle = headers.get(config.forwardUserHeader);
    if (handle === null) {
      return null;
    }
    const externalId = config.forwardUidHeader !== undefined ? headers.get(config.forwardUidHeader) : null;
    const groups = config.forwardGroupsHeader !== undefined ? groupsFromClaim(headers.get(config.forwardGroupsHeader)) : [];
    return {
      externalId: externalId !== null ? castId<ExternalId>(externalId) : null,
      handle: castId<Handle>(handle),
      groups,
      email: emailFromHeader(config.forwardEmailHeader, headers),
    };
  }
  const authentik = headers.get("x-authentik-username");
  if (authentik !== null) {
    const uid = headers.get("x-authentik-uid");
    return {
      externalId: uid !== null ? castId<ExternalId>(uid) : null,
      handle: castId<Handle>(authentik),
      groups: groupsFromClaim(headers.get("x-authentik-groups")),
      email: emailFromHeader("x-authentik-email", headers),
    };
  }
  const authelia = headers.get("remote-user");
  if (authelia !== null) {
    return {
      externalId: null,
      handle: castId<Handle>(authelia),
      groups: groupsFromClaim(headers.get("remote-groups")),
      email: emailFromHeader("remote-email", headers),
    };
  }
  const forwardedUser = headers.get("x-forwarded-user");
  if (forwardedUser !== null) {
    return {
      externalId: null,
      handle: castId<Handle>(forwardedUser),
      groups: groupsFromClaim(headers.get("x-forwarded-groups")),
      email: emailFromHeader("x-forwarded-email", headers),
    };
  }
  return null;
}

function emailFromHeader(name: string | undefined, headers: Headers): string | null {
  if (name === undefined) {
    return null;
  }
  const raw = headers.get(name);
  return raw !== null && raw.trim().length > 0 ? raw.trim() : null;
}

async function resolveSignedJwt(jwt: string, metaJwks: string | null, config: AuthConfig, deps: ResolveDeps): Promise<ResolvedIdentity | null> {
  if (metaJwks === null) {
    // JWT without its JWKS is a stripped/spoofed request — reject, do not fall through.
    securityEvent("jwt_no_jwks", {}, "security: forwarded JWT present without its JWKS — rejecting (possible stripped/spoofed request)");
    return null;
  }
  if (config.jwksAllowlist.length === 0) {
    // No trusted key source — refuse the request-supplied JWKS entirely.
    securityEvent("jwt_no_allowlist", {}, "security: JWT verification on but no JWKS allowlist/issuer configured — refusing the request-supplied JWKS");
    return null;
  }
  if (deps.verifyForwardJwt === undefined) {
    securityEvent("jwt_no_verifier", {}, "security: JWT verification on but no verifier injected — rejecting forwarded identity");
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
    return null;
  }
  if (claims.handle === undefined || claims.handle.length === 0) {
    // Verified but no preferred_username — refuse to fall through to the unsigned path.
    securityEvent("jwt_no_username", {}, "security: forwarded JWT verified but has no preferred_username claim — rejecting");
    return null;
  }
  return {
    externalId: claims.externalId !== null ? castId<ExternalId>(claims.externalId) : null,
    handle: castId<Handle>(claims.handle),
    groups: claims.groups,
    email: claims.email,
  };
}

function resolveUnsignedHeader(headers: Headers, config: AuthConfig, peerIp: string | undefined): ResolvedIdentity | null {
  const identity = readUnsignedIdentity(headers, config);
  if (identity === null) {
    return null;
  }
  // Fail-closed: without a signed JWT, an empty trusted-proxies allowlist means any client reaching the
  // socket could forge a raw `Remote-User: owner` header — require an explicit allowlist.
  if (config.forwardTrustedProxies.length === 0) {
    securityEvent(
      "forwarded_no_trusted_proxies",
      { handle: identity.handle },
      "security: unsigned forward-header identity but FORWARD_AUTH_TRUSTED_PROXIES is unset — rejecting (set it to the trusted proxy/client source range to enable the unsigned header path)",
    );
    return null;
  }
  // Gate on the TCP peer, not X-Forwarded-For/X-Real-IP — an attacker can forge any forwarded header but
  // not the socket peer.
  if (peerIp === undefined || !isInRanges(peerIp, config.forwardTrustedProxies)) {
    securityEvent(
      "forwarded_peer_rejected",
      { peerIp: peerIp ?? null, handle: identity.handle },
      "security: forwarded identity from an untrusted TCP peer — rejecting (the trusted-proxy gate matches the socket peer, not X-Forwarded-For)",
    );
    return null;
  }
  return identity;
}

export function resolveForwardHeader(headers: Headers, config: AuthConfig, deps: ResolveDeps): Promise<ResolvedIdentity | null> {
  const jwt = headers.get("x-authentik-jwt");
  if (config.verifyForwardJwt && jwt !== null) {
    return resolveSignedJwt(jwt, headers.get("x-authentik-meta-jwks"), config, deps);
  }
  return Promise.resolve(resolveUnsignedHeader(headers, config, deps.peerIp));
}
