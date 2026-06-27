// env → AuthConfig builder + the small parse helpers (CSV, host-list). The ONE place in this slice that
// reads `foundation/env` (downward — allowed; infra is above foundation). Mode resolvers + `resolve`
// take the `AuthConfig` explicitly so unit tests construct one directly (the frozen `env` can't be
// varied per-test); production omits `deps.config` and gets `authConfigFromEnv()`.

import { env } from "#foundation/env";
import type { AuthConfig } from "./contract";
import { normalizeHost } from "./host";

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
function jwksAllowlistFromEnv(): string[] {
  const explicit = parseHostList(env.FORWARD_AUTH_JWKS_ALLOWLIST);
  if (explicit.length > 0) {
    return explicit;
  }
  if (env.OIDC_ISSUER !== undefined) {
    try {
      return [normalizeHost(new URL(env.OIDC_ISSUER).host)];
    } catch {
      return [];
    }
  }
  return [];
}

/** The owner-handle set: `OWNER_HANDLES`, defaulting to `[DEFAULT_USER_HANDLE]` when unset (the
 *  single-user / owner-fallback handle is always an owner — D17). */
function ownerHandlesFromEnv(): string[] {
  const explicit = parseCsv(env.OWNER_HANDLES);
  return explicit.length > 0 ? explicit : [env.DEFAULT_USER_HANDLE];
}

/** Build the live `AuthConfig` from the frozen env. */
export function authConfigFromEnv(): AuthConfig {
  return {
    mode: env.AUTH_MODE,
    fallback: env.AUTH_FALLBACK,
    defaultHandle: env.DEFAULT_USER_HANDLE,
    ownerHandles: ownerHandlesFromEnv(),
    ...(env.OWNER_GROUP !== undefined ? { ownerGroup: env.OWNER_GROUP } : {}),
    verifyForwardJwt: env.FORWARD_AUTH_VERIFY_JWT,
    trustedLocalHosts: parseHostList(env.TRUSTED_LOCAL_HOSTS),
    trustedPrivateRanges: parseCsv(env.TRUSTED_PRIVATE_RANGES),
    ...(env.FORWARD_AUTH_USER_HEADER !== undefined
      ? { forwardUserHeader: env.FORWARD_AUTH_USER_HEADER }
      : {}),
    ...(env.FORWARD_AUTH_GROUPS_HEADER !== undefined
      ? { forwardGroupsHeader: env.FORWARD_AUTH_GROUPS_HEADER }
      : {}),
    ...(env.FORWARD_AUTH_UID_HEADER !== undefined
      ? { forwardUidHeader: env.FORWARD_AUTH_UID_HEADER }
      : {}),
    forwardTrustedProxies: parseCsv(env.FORWARD_AUTH_TRUSTED_PROXIES),
    jwksAllowlist: jwksAllowlistFromEnv(),
    ...(env.FORWARD_AUTH_JWT_ISSUER !== undefined
      ? { jwtIssuer: env.FORWARD_AUTH_JWT_ISSUER }
      : {}),
    ...(env.FORWARD_AUTH_JWT_AUDIENCE !== undefined
      ? { jwtAudience: env.FORWARD_AUTH_JWT_AUDIENCE }
      : {}),
  };
}
