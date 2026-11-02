// AUTH_MODE=forward-header, behind authentik/authelia forward-auth. SIGNED path (JWT+JWKS present):
// trusts claims cryptographically, skips the IP gate. UNSIGNED path: trusts raw identity headers, gated
// fail-closed on an explicit FORWARD_AUTH_TRUSTED_PROXIES allowlist matched against the TCP peer IP (not
// the spoofable X-Forwarded-For/X-Real-IP) — else any client reaching the socket could forge identity. A
// present-but-invalid JWT never falls through to the unsigned path, and no refused identity reaches the owner fallback.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { externalIdSchema, handleSchema } from "@orb/contracts/identity";
import { securityEvent } from "#foundation/observability";
import { isInRanges } from "#infra/network";
import type { AuthConfig, IdentityRefused, ResolveDeps } from "../contract.ts";
import { canonicalHost } from "../host-allowlist.ts";

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

// SECURITY: every refusal below is TERMINAL (Spine-Identity-and-Auth.md invariant 5). A presented identity that a gate,
// a parse or a verification refuses answers anonymous; returning `null` instead would hand it to the owner fallback.
const REFUSED: IdentityRefused = Object.freeze({ refused: true });

type UnsignedRead = ResolvedIdentity | IdentityRefused | null;

// SECURITY: a PRESENT header is the proxy's word even when it is empty. A value that does not parse refuses the whole
// identity. It must never defer to a lower-precedence header, which a client may supply through the proxy, and a
// subject that does not parse must never become "no subject", which would skip the bind-once mismatch check.
function identityFrom(rawHandle: string, rawUid: string | null, groups: string[], email: string | null): ResolvedIdentity | IdentityRefused {
  const handle = handleSchema.safeParse(rawHandle).data;
  const externalId = rawUid === null ? null : externalIdSchema.safeParse(rawUid).data;
  return handle === undefined || externalId === undefined ? REFUSED : { externalId, handle, groups, email };
}

// Order, by header presence: custom override, then authentik, then Authelia, then generic X-Forwarded-User. Returns
// null when no known user header is set, and the refusal when the selected one does not parse.
function readUnsignedIdentity(headers: Headers, config: AuthConfig): UnsignedRead {
  if (config.forwardUserHeader !== undefined) {
    const handle = headers.get(config.forwardUserHeader);
    if (handle === null) {
      return null;
    }
    const externalId = config.forwardUidHeader !== undefined ? headers.get(config.forwardUidHeader) : null;
    const groups = config.forwardGroupsHeader !== undefined ? groupsFromClaim(headers.get(config.forwardGroupsHeader)) : [];
    return identityFrom(handle, externalId, groups, emailFromHeader(config.forwardEmailHeader, headers));
  }
  const authentik = headers.get("x-authentik-username");
  if (authentik !== null) {
    return identityFrom(
      authentik,
      headers.get("x-authentik-uid"),
      groupsFromClaim(headers.get("x-authentik-groups")),
      emailFromHeader("x-authentik-email", headers),
    );
  }
  const authelia = headers.get("remote-user");
  if (authelia !== null) {
    return identityFrom(authelia, null, groupsFromClaim(headers.get("remote-groups")), emailFromHeader("remote-email", headers));
  }
  const forwardedUser = headers.get("x-forwarded-user");
  if (forwardedUser !== null) {
    return identityFrom(forwardedUser, null, groupsFromClaim(headers.get("x-forwarded-groups")), emailFromHeader("x-forwarded-email", headers));
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

// A presented JWT is resolved or refused, never absent: every failure here, the verifier's `null` included, is REFUSED.
async function resolveSignedJwt(jwt: string, metaJwks: string | null, config: AuthConfig, deps: ResolveDeps): Promise<ResolvedIdentity | IdentityRefused> {
  if (metaJwks === null) {
    // JWT without its JWKS is a stripped/spoofed request — reject, do not fall through.
    securityEvent("jwt_no_jwks", {}, "security: forwarded JWT present without its JWKS — rejecting (possible stripped/spoofed request)", deps.log);
    return REFUSED;
  }
  if (config.jwksAllowlist.length === 0) {
    // No trusted key source — refuse the request-supplied JWKS entirely.
    securityEvent(
      "jwt_no_allowlist",
      {},
      "security: JWT verification on but no JWKS allowlist/issuer configured — refusing the request-supplied JWKS",
      deps.log,
    );
    return REFUSED;
  }
  if (deps.verifyForwardJwt === undefined) {
    securityEvent("jwt_no_verifier", {}, "security: JWT verification on but no verifier injected — rejecting forwarded identity", deps.log);
    return REFUSED;
  }
  const claims = await deps.verifyForwardJwt.verify({
    jwt,
    metaJwks,
    allowlist: config.jwksAllowlist,
    ...(config.jwtIssuer !== undefined ? { issuer: config.jwtIssuer } : {}),
    ...(config.jwtAudience !== undefined ? { audience: config.jwtAudience } : {}),
  });
  if (claims === null) {
    // The verifier already emitted the security line naming why (verification, key set or claims).
    return REFUSED;
  }
  if (claims.handle === undefined || claims.handle.length === 0) {
    // Verified but no preferred_username — refuse to fall through to the unsigned path.
    securityEvent("jwt_no_username", {}, "security: forwarded JWT verified but has no preferred_username claim — rejecting", deps.log);
    return REFUSED;
  }
  return {
    externalId: claims.externalId !== null ? claims.externalId : null,
    handle: claims.handle,
    groups: claims.groups,
    email: claims.email,
  };
}

// The source gates run on header presence, before the parse verdict, so an untrusted peer is named as one whatever it sent.
function resolveUnsignedHeader(
  headers: Headers,
  config: AuthConfig,
  { peerIp, log }: Pick<ResolveDeps, "peerIp" | "log">,
): ResolvedIdentity | IdentityRefused | null {
  const identity = readUnsignedIdentity(headers, config);
  if (identity === null) {
    return null;
  }
  const handle = "refused" in identity ? null : identity.handle;
  // Fail-closed: without a signed JWT, an empty trusted-proxies allowlist means any client reaching the
  // socket could forge a raw `Remote-User: owner` header — require an explicit allowlist.
  if (config.forwardTrustedProxies.length === 0) {
    securityEvent(
      "forwarded_no_trusted_proxies",
      { handle },
      "security: unsigned forward-header identity but FORWARD_AUTH_TRUSTED_PROXIES is unset — rejecting (set it to the trusted proxy/client source range to enable the unsigned header path)",
      log,
    );
    return REFUSED;
  }
  // Gate on the TCP peer, not X-Forwarded-For/X-Real-IP — an attacker can forge any forwarded header but
  // not the socket peer.
  if (peerIp === undefined || !isInRanges(peerIp, config.forwardTrustedProxies)) {
    securityEvent(
      "forwarded_peer_rejected",
      { peerIp: peerIp ?? null, handle },
      "security: forwarded identity from an untrusted TCP peer — rejecting (the trusted-proxy gate matches the socket peer, not X-Forwarded-For)",
      log,
    );
    return REFUSED;
  }
  if ("refused" in identity) {
    securityEvent(
      "forwarded_identity_unparseable",
      { peerIp },
      "security: a trusted proxy sent a forwarded identity header whose username or uid does not parse — rejecting (no fall-through to a lower header or the owner fallback)",
      log,
    );
    return REFUSED;
  }
  return identity;
}

/**
 * WHICH SUB-PATH a forward-header request selects: the forwarded JWT when the deployment verifies signatures
 * AND the request carries one (⇒ `resolveSignedJwt`, which never falls through to the unsigned path), else
 * `null` (⇒ the raw-header path, gated on the trusted-proxy peer).
 *
 * Exported because the /api/_debug credential rule (`entry/auth/seam.ts`) has to tell the two apart on a
 * principal that records only `via:"header"`: a CRYPTOGRAPHICALLY verified SSO identity is a credential at
 * that door, a proxy-ASSERTED one is the trusted-proxy allowlist's word. One home so the two readers can
 * never drift into disagreeing about which path a request took.
 */
export function selectSignedForwardJwt(headers: Headers, config: AuthConfig): string | null {
  return config.verifyForwardJwt ? headers.get("x-authentik-jwt") : null;
}

// A SAME-HOST RELAY IS NEVER THE AUTH PROXY. The Share card's relay reaches this server from loopback, which a
// same-host proxy's trusted range covers, and it forwards any header a visitor sends, so `Remote-User: owner` through
// it would pass the peer gate. Its requests carry the relay's registered name as Host; that name refuses every
// identity, signed too, since nothing the relay forwards is the proxy's word.
function throughRelay(headers: Headers, deps: ResolveDeps): string | null {
  const host = headers.get("host");
  if (host === null || deps.relayHosts === undefined) {
    return null;
  }
  const canonical = canonicalHost(host);
  return deps.relayHosts().includes(canonical) ? canonical : null;
}

export function resolveForwardHeader(headers: Headers, config: AuthConfig, deps: ResolveDeps): Promise<ResolvedIdentity | IdentityRefused | null> {
  const jwt = selectSignedForwardJwt(headers, config);
  const relayHost = throughRelay(headers, deps);
  if (relayHost !== null) {
    securityEvent(
      "forwarded_via_relay",
      { host: relayHost, peerIp: deps.peerIp ?? null },
      "security: forward-header identity on a request through the share relay — rejecting (the relay is never the auth proxy)",
      deps.log,
    );
    // An identity presented through the relay is refused; a request that presents none stays absent.
    return Promise.resolve(jwt !== null || readUnsignedIdentity(headers, config) !== null ? REFUSED : null);
  }
  if (jwt !== null) {
    return resolveSignedJwt(jwt, headers.get("x-authentik-meta-jwks"), config, deps);
  }
  return Promise.resolve(resolveUnsignedHeader(headers, config, deps));
}
