// infra/auth — the cross-mode CONTRACT (read before adding a 5th mode). `auth/` is the sealed,
// db-free VERIFICATION executor (tiers/infra.md): one identity-resolution contract, four pluggable
// modes (`single-user`/`local`/`forward-header`/`oidc`) behind ONE dispatcher (`dispatch.ts`), shared
// pure helpers. This file holds the infra-INTERNAL cross-mode types: the parsed `AuthConfig`, the
// injected db-step ports (`ResolveDeps` — the proof the sealed executor never imports `@orb/db`), and
// the per-mode resolution outcome the dispatcher returns.
//
// LAYER RULE (structure.md §3): `infra` reaches DOWN (foundation, kit) only — NEVER `@orb/db`, NEVER a
// domain. Every db-dependent step (the cookie session validate; the user upsert; the OIDC PKCE store;
// the JWT/JWKS crypto verify) arrives INJECTED via `ResolveDeps`, wired at `entry/auth/seam.ts` (D1).
//
// NEW MODE CHECKLIST (adding a 5th mode — SAML, token-introspection, …):
//   1. Add the mode literal to `AuthConfig.mode`.
//   2. Add `modes/<mode>.ts` exporting the resolver (a `(headers, config, deps) => …` shape).
//   3. Add a `case` to `dispatch.ts:dispatchMode` — the `assertNever` default makes the omission a
//      `tsc` error (exhaustive-dispatch).
//   4. If the mode adds env config: extend `config.ts:authConfigFromEnv` + this `AuthConfig`.
//   5. The brand cast seam lives in the resolver — every raw header/claim value becomes
//      `castId<Handle>(…)` / `castId<ExternalId>(…)` BEFORE constructing a `ResolvedIdentity`.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";

/**
 * The parsed auth config the resolver needs, passed explicitly so unit tests can vary
 * mode/fallback/owner-set without re-parsing env. `config.ts:authConfigFromEnv()` builds the live one
 * (the SOLE place that reads `foundation/env` for this slice).
 */
export interface AuthConfig {
  mode: "single-user" | "local" | "forward-header" | "oidc";
  fallback: "owner" | "deny";
  /** The single-user identity + the owner-fallback handle (env `DEFAULT_USER_HANDLE`). */
  defaultHandle: string;
  /** Handles that provision as the box `owner` (env `OWNER_HANDLES`, defaulting to `[defaultHandle]`). */
  ownerHandles: readonly string[];
  /** An SSO group that, when present on the identity, provisions as `owner` (env `OWNER_GROUP`). */
  ownerGroup?: string;
  verifyForwardJwt: boolean;
  /** Extra hostnames trusted as a LOCAL origin for the owner fallback in SSO modes. The public FQDN
   *  must NEVER appear here (a proxy can only REMOVE trust, never grant it). */
  trustedLocalHosts: readonly string[];
  /** Extra CIDR ranges (env `TRUSTED_PRIVATE_RANGES`) added to the built-in private set for the
   *  local-origin gate. Absent ⇒ just `DEFAULT_TRUSTED_RANGES`. */
  trustedPrivateRanges: readonly string[];
  /** Custom UNSIGNED forward-header NAMES (override the authentik/authelia families). */
  forwardUserHeader?: string;
  forwardGroupsHeader?: string;
  forwardUidHeader?: string;
  /** Opt-in source-IP gate for the unsigned path: CIDRs the forwarded client IP must match. Empty ⇒
   *  no gate (network-isolation trust). The signed-JWT path never consults this. */
  forwardTrustedProxies: readonly string[];
  /** JWKS-URL host allowlist for the `X-Authentik-Meta-Jwks` header. Empty ⇒ FAIL-CLOSED at the
   *  resolver: with verify on but no trusted key source, the signed path is refused. */
  jwksAllowlist: readonly string[];
  /** Optional expected iss/aud enforced on the forwarded JWT. */
  jwtIssuer?: string;
  jwtAudience?: string;
}

/**
 * The cookie-validate result for the `local`/`oidc` modes: the FULLY-resolved session row. The cookie
 * JOIN already has `users.id`/`role`/`enabled`, so returning them here kills the historic re-query
 * (spine invariant #2 — resolve identity ONCE). `null` ⇒ missing/revoked/expired. Injected from
 * `domain/sessions.validate` at the seam; absent (`deps.validateCookie` unset) ⇒ the cookie layer is
 * inert (no db reach from infra).
 */
export interface ValidatedSession {
  userId: UserId;
  handle: Handle;
  externalId: ExternalId | null;
  role: UserRole;
  enabled: boolean;
}

/**
 * The user-upsert result for the SSO-header + owner-fallback paths. `seedRole` is applied on INSERT
 * and PRESERVED on UPDATE (a granted `admin` survives the next login — spine §3), so the returned
 * `role` is the STORED row's role, not necessarily the seed. Injected from
 * `domain/sessions.provisionIdentity`.
 */
export interface UpsertedUser {
  userId: UserId;
  role: UserRole;
  enabled: boolean;
}

/**
 * One OIDC PKCE/state transaction (minted at the authorize redirect, consumed single-use at the
 * callback). Stored db-backed in `domain/sessions/persistence/oidc-store.ts` (it imports `@orb/db`, so
 * it CANNOT live in sealed infra) and injected here as the port below.
 */
export interface OidcTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  createdAt: number;
}

/**
 * The injected, db-backed OIDC transaction store. `consume` is ATOMIC + single-use (take-and-delete) —
 * a replayed `state` finds nothing the second time, so a stolen callback URL can't be re-driven.
 */
export interface OidcTransactionStore {
  consume: (state: string) => Promise<OidcTransaction | null>;
}

/** The structured claims a verified forward-header JWT yields. `handle` is the `preferred_username`
 *  claim — `undefined` when the JWT verified but carries none (the mode rejects rather than fall
 *  through to the unsigned path — fail-closed point #4). */
export interface ForwardJwtClaims {
  handle: string | undefined;
  externalId: string | null;
  groups: string[];
}

/** Args for the injected forward-header JWT verifier. */
export interface ForwardJwtVerifyArgs {
  jwt: string;
  metaJwks: string;
  allowlist: readonly string[];
  issuer?: string;
  audience?: string;
}

/**
 * The injected forward-header JWT verifier (jose-backed; wired at `entry/` in 4e — `jose` is NOT yet a
 * catalog dep, so the crypto is deferred behind this port, db/crypto-free here). `verify` builds the
 * JWKS keyset from `metaJwks` (literal or https-allowlisted URL) and verifies the JWT, returning the
 * extracted claims or `null` on ANY JWKS-build / signature / shape failure (fail-closed points #3 + #5).
 * The framing policy (no-jwks, empty-allowlist, no-username) stays in `modes/forward-header.ts`.
 */
export interface ForwardJwtVerifier {
  verify: (args: ForwardJwtVerifyArgs) => Promise<ForwardJwtClaims | null>;
}

/**
 * The db-dependent resolution steps, injected at `entry/auth/seam.ts` so this infra module stays free
 * of `@orb/db` + domain imports. Every field is optional EXCEPT `upsertUser` (the resolver cannot mint
 * a `Principal` — which requires a real `userId` — without it on the SSO/fallback paths).
 */
export interface ResolveDeps {
  /** `local`/`oidc`: validate the `__Host` session token → the resolved session, or `null`. */
  validateCookie?: (
    token: string,
    onSlide?: (expiresAt: number) => void,
  ) => Promise<ValidatedSession | null>;
  /** SSO-header + owner-fallback: upsert the identity → the stored users row (role-seeding + enabled). */
  upsertUser: (identity: ResolvedIdentity, seedRole: UserRole) => Promise<UpsertedUser>;
  /** forward-header signed path: the jose-backed JWT/JWKS verifier (deferred to 4e — see the port). */
  verifyForwardJwt?: ForwardJwtVerifier;
  /** OIDC callback: the db-backed PKCE/state store (consumed by `verifyPkceState`, not by `resolve`). */
  oidcStore?: OidcTransactionStore;
  /** Fired with the slid expiry on a throttled server-side session slide (cookie Max-Age refresh). */
  onSessionSlide?: (expiresAt: number) => void;
  /** Test/override seam: the parsed `AuthConfig`. Production omits it → `authConfigFromEnv()`. */
  config?: AuthConfig;
}

// The per-mode resolution outcome (`session` | `identity` | `none`) is a file-local type in
// `dispatch.ts` (an infra-internal shape, never a boundary type — so not declared here).
