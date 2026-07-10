// `forward-header` (AUTH_MODE=forward-header, behind authentik/authelia forward-auth) — the proxy
// terminates SSO and injects per-request identity headers. Two paths:
//
//   • SIGNED  — verify-on + a forwarded JWT + its JWKS: trust the CLAIMS (cryptographic spoof-proof
//     regardless of network path; skips the source-IP gate — the signature IS the proof).
//   • UNSIGNED — verify-off or no JWT: network-trust of the raw headers (authentik X-Authentik-*,
//     Authelia Remote-*, oauth2-proxy/generic X-Forwarded-User, or a custom-named proxy), guarded by the
//     MANDATORY FORWARD_AUTH_TRUSTED_PROXIES gate matched against the TCP PEER IP (the socket's remote
//     address, threaded from entry — NOT a spoofable X-Forwarded-For/X-Real-IP header; B1 anti-spoof) —
//     FAIL-CLOSED (point (6) below) when that allowlist is unset (no signed JWT means no cryptographic
//     proof, so an operator MUST declare which source may inject identity headers; otherwise any client
//     that reaches the app socket could send `Remote-User: owner`). The signed-JWT path never consults
//     this gate.
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
//   (6) UNSIGNED path + EMPTY FORWARD_AUTH_TRUSTED_PROXIES → reject. With no signed JWT there is no
//       cryptographic proof and no declared trusted source, so trusting raw identity headers would let
//       any client that reaches the app socket forge `Remote-User: owner`. The operator opts in by
//       naming the trusted proxy/client source range(s); until then the unsigned path is refused.
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

/** Read an UNSIGNED forwarded identity from the configured/known trusted headers. Order: a custom
 *  override (FORWARD_AUTH_USER_HEADER), then authentik (X-Authentik-*), then Authelia (Remote-*), then
 *  the generic de-facto standard X-Forwarded-User (oauth2-proxy, Traefik forward-auth, nginx
 *  auth_request) so a non-authentik/non-authelia proxy works without custom header config. Authelia and
 *  the generic family have no stable uid → externalId stays null (handle keys the row). Returns null when
 *  no known user header is set. CAST SEAM: every raw header value becomes a branded Handle / ExternalId
 *  here. */
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
  // Generic reverse-proxy family (oauth2-proxy / Traefik forward-auth / nginx auth_request): the de-facto
  // standard X-Forwarded-User (+ X-Forwarded-Groups / X-Forwarded-Email). No stable uid → externalId null.
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

/** Read a mutable email attribute from a (named) forward header → a non-empty string or null. `undefined`
 *  header name (custom family, unset FORWARD_AUTH_EMAIL_HEADER) ⇒ null. Never an identity key. */
function emailFromHeader(name: string | undefined, headers: Headers): string | null {
  if (name === undefined) {
    return null;
  }
  const raw = headers.get(name);
  return raw !== null && raw.trim().length > 0 ? raw.trim() : null;
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
    email: claims.email,
  };
}

/** The UNSIGNED path: the raw trusted headers + the MANDATORY PEER-IP gate (fail-closed point (6)). The
 *  gate subject is the TCP `peerIp` (the socket's remote address, threaded from entry) — NOT a spoofable
 *  forwarded header — so a direct-socket attacker can't forge the trusted hop (B1 anti-spoof). */
function resolveUnsignedHeader(
  headers: Headers,
  config: AuthConfig,
  peerIp: string | undefined,
): ResolvedIdentity | null {
  const identity = readUnsignedIdentity(headers, config);
  if (identity === null) {
    return null;
  }
  // (6) FAIL-CLOSED: the unsigned trusted-header path REQUIRES an explicit FORWARD_AUTH_TRUSTED_PROXIES
  // allowlist. Empty ⇒ reject. Without a signed JWT there is no cryptographic proof AND no declared
  // trusted source, so a raw `Remote-User: owner` from any client that reaches the app socket would
  // otherwise become the owner. The operator opts in by naming the trusted proxy/client source range(s).
  // (The signed-JWT authentik path never reaches here, so a verify-on JWT deployment is unaffected.)
  if (config.forwardTrustedProxies.length === 0) {
    securityEvent(
      "forwarded_no_trusted_proxies",
      { handle: identity.handle },
      "security: unsigned forward-header identity but FORWARD_AUTH_TRUSTED_PROXIES is unset — rejecting (set it to the trusted proxy/client source range to enable the unsigned header path)",
    );
    return null;
  }
  // PEER-IP gate (B1 anti-spoof): the TCP peer — the immediate socket's remote address — must fall inside
  // the trusted range. Gating on the PEER, not `X-Forwarded-For`/`X-Real-IP`, is the whole fix: an attacker
  // who reaches the app socket directly can forge any forwarded header but CANNOT change the socket peer, so
  // a request from an off-allowlist peer is rejected even if its XFF claims a trusted IP. `undefined` peer
  // (no conninfo threaded) ⇒ unverifiable source ⇒ reject.
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
  return Promise.resolve(resolveUnsignedHeader(headers, config, deps.peerIp));
}
