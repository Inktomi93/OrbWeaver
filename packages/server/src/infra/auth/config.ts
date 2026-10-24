// env record → AuthConfig builder + the small parse helpers (CSV, host-list). Mode resolvers + `resolve` take the
// `AuthConfig` explicitly; the composition root builds it once from its parsed env record.

import type { Env } from "#foundation/env/record";
import { parseOwnerFallbackTrustedPeers } from "#foundation/env/record";
import type { AuthConfig } from "./contract.ts";
import { normalizeHost } from "./host.ts";

/** Parse a comma-list env value into trimmed non-empty entries (CIDR strings, header names, …). */
function parseCsv(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse a comma-list of hostnames into normalized (lowercased, port-stripped) entries. */
function parseHostList(raw: string | undefined): string[] {
  return parseCsv(raw)
    .map((h) => normalizeHost(h))
    .filter((h) => h.length > 0);
}

/** The JWKS host allowlist: explicit `FORWARD_AUTH_JWKS_ALLOWLIST`, else the `OIDC_ISSUER` host when
 *  set, else empty. Empty is FAIL-CLOSED at the resolver (no trusted key source ⇒ the signed path is
 *  refused). */
function jwksAllowlistFromEnv(record: Env): string[] {
  const explicit = parseHostList(record.FORWARD_AUTH_JWKS_ALLOWLIST);
  if (explicit.length > 0) {
    return explicit;
  }
  if (record.OIDC_ISSUER !== undefined) {
    // The env parse (`z.url()`) already refused an issuer `new URL` cannot read, so this construction cannot throw.
    return [normalizeHost(new URL(record.OIDC_ISSUER).host)];
  }
  return [];
}

// The owner-handle / owner-group env (`OWNER_HANDLES` / `OWNER_GROUP`) is NOT read here: the owner-ROLE
// decision (`determineRole`) is the RESOLUTION tier's (`domain/sessions/substrate/role-policy.ts`, 4c),
// not verification's. Verification only stamps the `defaultHandle` on the `via:"fallback"` identity; the
// seam mints the owner from that discriminant (invariant #7).

/** Build the live `AuthConfig` from a parsed env record. */
export function authConfigFromEnv(record: Env): AuthConfig {
  return {
    mode: record.AUTH_MODE,
    fallback: record.AUTH_FALLBACK,
    defaultHandle: record.DEFAULT_USER_HANDLE,
    verifyForwardJwt: record.FORWARD_AUTH_VERIFY_JWT,
    ...(record.FORWARD_AUTH_USER_HEADER !== undefined ? { forwardUserHeader: record.FORWARD_AUTH_USER_HEADER } : {}),
    ...(record.FORWARD_AUTH_GROUPS_HEADER !== undefined ? { forwardGroupsHeader: record.FORWARD_AUTH_GROUPS_HEADER } : {}),
    ...(record.FORWARD_AUTH_UID_HEADER !== undefined ? { forwardUidHeader: record.FORWARD_AUTH_UID_HEADER } : {}),
    ...(record.FORWARD_AUTH_EMAIL_HEADER !== undefined ? { forwardEmailHeader: record.FORWARD_AUTH_EMAIL_HEADER } : {}),
    forwardTrustedProxies: parseCsv(record.FORWARD_AUTH_TRUSTED_PROXIES),
    // The parse is `foundation/env`'s, not a fourth CSV split: the ranges the boot warning names and the
    // ranges the peer gate matches must be the SAME list or the operator is reading a lie.
    fallbackTrustedPeers: parseOwnerFallbackTrustedPeers(record.AUTH_FALLBACK_TRUSTED_PEERS),
    jwksAllowlist: jwksAllowlistFromEnv(record),
    ...(record.FORWARD_AUTH_JWT_ISSUER !== undefined ? { jwtIssuer: record.FORWARD_AUTH_JWT_ISSUER } : {}),
    ...(record.FORWARD_AUTH_JWT_AUDIENCE !== undefined ? { jwtAudience: record.FORWARD_AUTH_JWT_AUDIENCE } : {}),
  };
}

/** The configured callback URLs, shared by owner-claim publication and OIDC route construction. */
export function oidcRedirectAllowlist(raw: string | undefined): readonly string[] {
  return parseCsv(raw);
}
