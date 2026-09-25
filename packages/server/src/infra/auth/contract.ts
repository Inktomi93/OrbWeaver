// The cross-mode auth contract. auth/ is the sealed, db-free VERIFICATION executor: it turns a request's
// headers into a pre-row ResolvedIdentity — it does NOT resolve a userId, derive a role, upsert, or mint
// a Principal (those are domain/sessions + entry/auth/seam.ts). Reaches down only — never @orb/db, never a domain.

import type { AuthMode, ResolvedIdentity } from "@orb/contracts/identity";
import type { ExternalId, Handle } from "@orb/kit/ids";
// `authorizationCodeGrant` is imported TYPE-ONLY (it is named solely in a `typeof` position for
// {@link OidcCodeGrant}) so this contract module stays value-free and pulls no library code into a type import.
import type { authorizationCodeGrant, Configuration } from "openid-client";

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
  /** `AUTH_FALLBACK_TRUSTED_PEERS` — the opt-in CIDR ranges admitted to the un-credentialed owner fallback IN
   *  ADDITION to loopback (docs/plans/containerize/design.md arm (b); the rule, the hazard and the boot
   *  warning live in `foundation/env/fallback-peers.ts`). EMPTY IS THE DEFAULT and is byte-identical to the
   *  loopback-only gate #298 f2 established. Distinct from `forwardTrustedProxies`, which gates who may
   *  ASSERT an identity in a header; this one gates who IS the owner without asserting anything. */
  fallbackTrustedPeers: readonly string[];
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
  /** D254 — the peppered hash of the signup invite the login carried (`?invite=`), or null. Never the raw token. */
  inviteTokenHash: string | null;
}

// consume is atomic + single-use — a replayed state finds nothing the second time.
export interface OidcTransactionStore {
  consume: (state: string) => Promise<OidcTransaction | null>;
}

/** #867 — what a SUCCESSFUL code→token exchange yields, narrowed to the two values the OIDC callback
 *  actually consumes. Deliberately NOT openid-client's `TokenEndpointResponse`: the access/refresh tokens
 *  are the RP's business with the IdP and nothing above this seam may reach them, so they do not cross it. */
export interface OidcVerifiedTokens {
  /** The VERIFIED ID-token claims (`tokens.claims()`), or `undefined` when the response carried no ID
   *  token. Still untrusted DATA — every field is shape-checked by `identityFromClaims` before use. */
  readonly claims: { readonly [claim: string]: unknown } | undefined;
  /** #141 — the RAW verified ID token, carried to `sessions.create`, which seals it at rest. It is a
   *  SECRET: never logged, never put in a response body, never held past the mint. */
  readonly idToken: string | null;
}

/**
 * #867 — the injected OIDC authorization-code exchange (`openid-client`'s `authorizationCodeGrant`, wired
 * at the composition root; a deterministic fake in tests). The adapter that performs it is
 * `./oidc-exchange.ts`; the type homes here beside {@link OidcDiscover} because a slice-internal shape
 * belongs in the slice's contract, not beside its one consumer.
 *
 * THE WHOLE TRANSACTION IS THE THIRD PARAMETER, not three loose check values. `pkceCodeVerifier`,
 * `expectedNonce` and `expectedState` are the code-injection / replay / CSRF defences of the code flow,
 * and a call site that assembled them by hand could silently omit one and still type-check. Passing the
 * consumed {@link OidcTransaction} makes that omission unconstructible: there is exactly one place that
 * maps a transaction onto the grant's checks, and it is the adapter.
 *
 * IT THROWS, AND THAT IS THE CONTRACT. A replayed/expired code, an issuer/audience/nonce/state mismatch,
 * a bad signature, or a transient IdP fault all reject — the route's fail-closed handler converts the
 * throw into a sanitized error code and mints no session. An implementation that swallowed a failure into
 * a resolved value would move the fail-closed decision out of the route that owns it.
 */
export type OidcExchange = (config: Configuration, callbackUrl: URL, tx: OidcTransaction) => Promise<OidcVerifiedTokens>;

/** #867 — the raw `openid-client` grant `createOidcExchange` closes over. Named as a type so the ONE value
 *  binding to the library lives at the composition root (`entry/lifecycle.ts`) and the adapter's
 *  transaction→checks mapping is provable without an IdP — the same shape `createOidcConfigCache(discover)`
 *  already uses for discovery. */
export type OidcCodeGrant = typeof authorizationCodeGrant;

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
  /** Emits the `owner_fallback_relayed` security line for a refused relayed request. The composition root
   *  injects the per-peer throttled one (`createRelayedFallbackNotice`); absent, every refusal logs. */
  relayedFallbackNotice?: RelayedFallbackNotice;
}

/** Reports one relayed request refused the owner fallback, keyed by its raw TCP peer. */
export type RelayedFallbackNotice = (peerIp: string | undefined) => void;

/** Reports one session minted over plain http for a public client, keyed by the resolved client address. */
export type PublicHttpMintNotice = (clientIp: string | null) => void;

/** Reports one request refused by the Host allowlist, keyed by the canonical refused host. */
export type HostNotAllowedNotice = (host: string) => void;

/** The names the Host allowlist admits beyond the always-allowed ones, read on every request. */
export type AllowedHostsReader = () => readonly string[];

/** The relay host registry's write side: the injected op the relay controller receives, and no other caller. Every
 *  name is exact and canonical: `add` refuses a suffix, a wildcard, a port or a scheme with a `DomainOperationError`
 *  and returns the canonical name it admitted. `clear` runs when the relay stops. The one writer is
 *  `domain/share`'s relay controller, built once at `entry/lifecycle.ts`. */
export interface RelayHostWriter {
  readonly add: (host: string) => string;
  readonly remove: (host: string) => void;
  readonly clear: () => void;
}

/** The server-owned relay host set (`createRelayHostRegistry`): the composition root hands `hosts` to the Host
 *  allowlist and `writer` to the relay controller. */
export interface RelayHostRegistry {
  readonly hosts: AllowedHostsReader;
  readonly writer: RelayHostWriter;
}

/** An auth cookie's name (the session or the OIDC binding) and the `Set-Cookie` attributes that name requires. */
export interface SessionCookie {
  readonly name: string;
  readonly attrs: string;
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
