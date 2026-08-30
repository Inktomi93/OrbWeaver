// The cross-mode auth contract. auth/ is the sealed, db-free VERIFICATION executor: it turns a request's
// headers into a pre-row ResolvedIdentity — it does NOT resolve a userId, derive a role, upsert, or mint
// a Principal (those are domain/sessions + entry/auth/seam.ts). Reaches down only — never @orb/db, never a domain.

import type { AuthMode, ResolvedIdentity } from "@orb/contracts/identity";
import type { ExternalId, Handle } from "@orb/kit/ids";
import type { Configuration } from "openid-client";

/** Parsed auth config, passed explicitly so unit tests can vary mode/fallback without re-parsing env. */
export interface AuthConfig {
  mode: AuthMode;
  fallback: "owner" | "deny";
  defaultHandle: string;
  verifyForwardJwt: boolean;
  forwardUserHeader?: string;
  forwardGroupsHeader?: string;
  forwardUidHeader?: string;
  forwardEmailHeader?: string;
  /** Mandatory source gate for the unsigned path: empty means fail-closed. */
  forwardTrustedProxies: readonly string[];
  /** JWKS-URL host allowlist; empty means fail-closed at the resolver. */
  jwksAllowlist: readonly string[];
  jwtIssuer?: string;
  jwtAudience?: string;
}

/** #762 — the injected OIDC issuer-discovery round-trip (`openid-client`'s `discovery()` with the issuer,
 *  client id and secret, at the composition root; a deterministic fake in tests). The single-flight cache that
 *  consumes it is `./oidc-discovery.ts`; the type homes here because a domain-internal shape belongs in the
 *  slice's `contract/`, not beside its one consumer. */
export type OidcDiscover = () => Promise<Configuration>;

/** One OIDC PKCE/state transaction, minted at authorize and consumed single-use at the callback. */
export interface OidcTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  createdAt: number;
}

// consume is atomic + single-use — a replayed state finds nothing the second time.
export interface OidcTransactionStore {
  consume: (state: string) => Promise<OidcTransaction | null>;
}

export interface ForwardJwtClaims {
  handle: Handle | undefined;
  externalId: ExternalId | null;
  groups: string[];
  email: string | null;
}

export interface ForwardJwtVerifyArgs {
  jwt: string;
  metaJwks: string;
  allowlist: readonly string[];
  issuer?: string;
  audience?: string;
}

// Returns null on any JWKS-build/signature/shape failure (fail-closed).
export interface ForwardJwtVerifier {
  verify: (args: ForwardJwtVerifyArgs) => Promise<ForwardJwtClaims | null>;
}

/** Db-dependent VERIFICATION steps, injected at entry/auth/seam.ts. All optional — each absent dep makes
 *  its layer inert. No upsertUser/determineRole/validateCookie here — those are resolution-tier reads. */
export interface ResolveDeps {
  verifyForwardJwt?: ForwardJwtVerifier;
  oidcStore?: OidcTransactionStore;
  /** Raw TCP peer socket address — never a spoofable X-Forwarded-For/X-Real-IP header. TWO gates read it:
   *  the forward-header unsigned trusted-proxy gate (`modes/forward-header.ts`) and, since #298 f2, the
   *  LOOPBACK gate on the un-credentialed owner fallback (`ownerFallbackAllowed`, `dispatch.ts`). Absent
   *  means BOTH fail closed. */
  peerIp?: string;
  config?: AuthConfig;
}

export type ModeResolver = (headers: Headers, config: AuthConfig, deps: ResolveDeps) => Promise<ResolvedIdentity | null>;

/** Verification-tier output: the pre-row identity plus per-request signals. Carries no userId/role — the
 *  seam resolves the row and mints the Principal from this. Infra never resolves a cookie (the seam does
 *  via sessions.validate), so infra only yields "header" or "fallback" — "cookie" is the seam's own via. */
export interface IdentityResolution {
  identity: ResolvedIdentity | null;
  via: "header" | "fallback";
  hasCsrfHeader: boolean;
}
