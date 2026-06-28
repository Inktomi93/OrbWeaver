// infra/auth — the cross-mode CONTRACT (read before adding a 5th mode). `auth/` is the sealed, db-free
// VERIFICATION executor (tiers/infra.md + spine identity-auth-permission.md §1/§3): it turns a request's
// headers into a pre-row `ResolvedIdentity` (+ the per-request signals) — and NOTHING more. It does NOT
// resolve a `userId`, does NOT read/derive a role, does NOT upsert, does NOT mint a `Principal`. Those
// are LOWER tiers:
//   • RESOLUTION + the users-row upsert + `determineRole` → `domain/sessions` (Phase 4c).
//   • CONSTRUCTION (the ONE `Principal` mint) → `entry/auth/seam.ts` (Phase 4e, invariant #1).
//
// This file holds the infra-INTERNAL cross-mode types: the parsed `AuthConfig`, the injected
// VERIFICATION steps (`ResolveDeps` — the proof the sealed executor never imports `@orb/db`/domain), the
// JWT/JWKS + OIDC-PKCE ports, and the verification OUTPUT (`IdentityResolution`).
//
// LAYER RULE (structure.md §3): `infra` reaches DOWN (foundation, kit) only — NEVER `@orb/db`, NEVER a
// domain. Every db-dependent VERIFICATION step (the cookie session validate; the JWT/JWKS crypto; the
// OIDC PKCE store) arrives INJECTED via `ResolveDeps`, wired at `entry/auth/seam.ts`.
//
// NEW MODE CHECKLIST (adding a 5th mode — SAML, token-introspection, …):
//   1. Add the mode to `AUTH_MODES` in `@orb/contracts/identity` (AuthConfig.mode + MODE_RESOLVERS derive).
//   2. Add `modes/<mode>.ts` exporting the resolver (`(headers, config, deps) => ResolvedIdentity|null`).
//   3. Add the entry to `dispatch.ts:MODE_RESOLVERS` — the `Record<AuthConfig["mode"], ModeResolver>`
//      mapped type makes the omission a `tsc` error (invariant #4, exhaustive dispatch).
//   4. If the mode adds env config: extend `config.ts:authConfigFromEnv` + this `AuthConfig`.
//   5. The brand cast seam lives in the resolver — every raw header/claim value becomes
//      `castId<Handle>(…)` / `castId<ExternalId>(…)` BEFORE constructing a `ResolvedIdentity`.

import type { AuthMode, ResolvedIdentity } from "@orb/contracts/identity";

/**
 * The parsed auth config the resolver needs, passed explicitly so unit tests can vary mode/fallback
 * without re-parsing env. `config.ts:authConfigFromEnv()` builds the live one (the SOLE place that reads
 * `foundation/env` for this slice). NOTE: there is NO owner-handle / owner-group config here — the
 * owner-ROLE decision (`determineRole`) is the RESOLUTION tier's (`domain/sessions`), not verification's.
 */
export interface AuthConfig {
  mode: AuthMode;
  fallback: "owner" | "deny";
  /** The single-user identity + the owner-fallback handle (env `DEFAULT_USER_HANDLE`). The seam mints
   *  the owner from the `via:"fallback"` discriminant — this is just the handle that fallback stamps. */
  defaultHandle: string;
  verifyForwardJwt: boolean;
  /** Extra hostnames trusted as a LOCAL origin for the owner fallback in SSO modes. The public FQDN must
   *  NEVER appear here (a proxy can only REMOVE trust, never grant it). */
  trustedLocalHosts: readonly string[];
  /** Extra CIDR ranges (env `TRUSTED_PRIVATE_RANGES`) added to the built-in private set for the
   *  local-origin gate. Absent ⇒ just `DEFAULT_TRUSTED_RANGES`. */
  trustedPrivateRanges: readonly string[];
  /** Custom UNSIGNED forward-header NAMES (override the authentik/authelia families). */
  forwardUserHeader?: string;
  forwardGroupsHeader?: string;
  forwardUidHeader?: string;
  /** Opt-in source-IP gate for the unsigned path: CIDRs the forwarded client IP must match. Empty ⇒ no
   *  gate (network-isolation trust). The signed-JWT path never consults this. */
  forwardTrustedProxies: readonly string[];
  /** JWKS-URL host allowlist for the `X-Authentik-Meta-Jwks` header. Empty ⇒ FAIL-CLOSED at the
   *  resolver: with verify on but no trusted key source, the signed path is refused. */
  jwksAllowlist: readonly string[];
  /** Optional expected iss/aud enforced on the forwarded JWT. */
  jwtIssuer?: string;
  jwtAudience?: string;
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
 *  claim — `undefined` when the JWT verified but carries none (the mode rejects rather than fall through
 *  to the unsigned path — fail-closed point #4). */
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
 * The db-dependent VERIFICATION steps, injected at `entry/auth/seam.ts` so this infra module stays free
 * of `@orb/db` + domain imports. ALL optional — each absent dep makes its layer inert (db-free fallback).
 *
 * There is deliberately NO `upsertUser` and NO `determineRole` here: those are the RESOLUTION tier's
 * (`domain/sessions`), invoked by the seam AFTER verification (invariant #1 — the seam is the only place
 * that turns a `ResolvedIdentity` into a row-backed `Principal`).
 */
export interface ResolveDeps {
  /** `local`/`oidc`: validate the `__Host` session token → the pre-row identity, or `null`
   *  (missing/revoked/expired). Returns a `ResolvedIdentity` — NO `userId`/`role` (invariant #3).
   *  FLAG (D40 — reconcile at 4c/4e): a session cookie inherently resolves to a user ROW, so this port's
   *  honest output includes `userId` — but invariant #3 forbids infra to carry a row id, so the id is
   *  dropped here, recreating the neo "validate threw the id away" bug (sessions.md §"resolved twice"). PER
   *  D40 the cookie→user resolution is a DOMAIN step (`sessions.validate`, which returns `userId`) the SEAM
   *  calls directly; this infra port is REMOVED when 4c/4e land. Do NOT wire it as the `userId` source. */
  validateCookie?: (
    token: string,
    onSlide?: (expiresAt: number) => void,
  ) => Promise<ResolvedIdentity | null>;
  /** forward-header signed path: the jose-backed JWT/JWKS verifier (deferred to 4e — see the port). */
  verifyForwardJwt?: ForwardJwtVerifier;
  /** OIDC callback: the db-backed PKCE/state store (consumed by `verifyPkceState`, not by `resolve`). */
  oidcStore?: OidcTransactionStore;
  /** Fired with the slid expiry on a throttled server-side session slide (cookie Max-Age refresh). */
  onSessionSlide?: (expiresAt: number) => void;
  /** Test/override seam: the parsed `AuthConfig`. Production omits it → `authConfigFromEnv()`. */
  config?: AuthConfig;
}

/**
 * The uniform shape every mode strategy implements: headers + parsed config + the injected verification
 * deps → a pre-row `ResolvedIdentity` (or `null` when the mode resolves nothing). `dispatch.ts` keys the
 * dispatcher `Record<AuthConfig["mode"], ModeResolver>` — exhaustive over the modes (invariant #4). The
 * one cross-mode shape, homed here with the rest of the contract (tiers/infra.md), not file-local.
 */
export type ModeResolver = (
  headers: Headers,
  config: AuthConfig,
  deps: ResolveDeps,
) => Promise<ResolvedIdentity | null>;

/**
 * The VERIFICATION-tier OUTPUT (spine §1): the pre-row identity PLUS the per-request signals the seam
 * needs. Carries NO `userId` and NO `role` (invariant #3) — the seam (`entry/auth/seam.ts`) resolves the
 * row + mints the `Principal` from this.
 *   - `identity` — the resolved `ResolvedIdentity`, or `null` when the caller is unauthenticated (→ 401).
 *   - `via` — how it resolved; the seam maps it to `Principal.via` and mints the OWNER on `"fallback"`
 *     (invariant #7 — the SAFE "this IS the owner" discriminator, never `externalId === null`).
 *   - `viaCookie` — the CSRF-relevant signal (a cookie request has a cross-site surface; `via === "cookie"`).
 *   - `hasCsrfHeader` — whether the custom CSRF header was present; the seam GATES on it (invariant #9).
 */
export interface IdentityResolution {
  identity: ResolvedIdentity | null;
  via: "cookie" | "header" | "fallback";
  viaCookie: boolean;
  hasCsrfHeader: boolean;
}
