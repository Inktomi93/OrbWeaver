// The typed API surface: `SessionsService` is the authoritative verb listing, `SessionsContext` the DI
// bundle. 13 verbs across the BFF session lifecycle + identity resolution.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { ExternalId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import type { CreateSessionParams, ProvisionIdentityOptions } from "./params.ts";
import type { CreateSessionResult, LinkExternalIdResult, ProvisionResult, RevokedSessionsSummary, UserPrincipalFields, ValidatedSession } from "./results.ts";

/** The DI bundle every verb closes over, wired at the composition root. */
export interface SessionsContext {
  db: Db;
  now: () => number;
  /** Mint a fresh opaque session token (256 bits of CSPRNG entropy). Rides the DI seam exactly like
   *  {@link SessionsContext.hashToken}, so `verbs/create` never reaches the `tokens/` subsystem directly
   *  (`domain-substrate-mediates-subsystems`) and a test can substitute a deterministic mint without a cast. */
  mintToken: () => SessionToken;
  /** The peppered token hasher, bound to `SESSION_SECRET` at the root; throws if the pepper is unset.
   *  NARROWED to `SessionToken`: the underlying `createTokenHasher` is generic (chat invites share it), but
   *  inside this domain only a branded session token may be hashed into a `sessions.token_hash` lookup key. */
  hashToken: (token: SessionToken) => string;
  /** Session lifetime + slide-throttle (ms), injected from the `tokens/` subsystem. */
  ttlMs: number;
  slideThrottleMs: number;
  /** Password verify, bound from the same `SESSION_SECRET` pepper as `hashToken`. Constant-time against a
   *  stored hash; a null/malformed stored value is a fast `false`. */
  verifyPassword: (plain: string, stored: string | null | undefined) => Promise<boolean>;
}

export interface SessionsService {
  /** Mint an opaque 32-byte token + persist only its peppered hash; audits `AUTH_LOGIN`. Returns the raw
   *  token once — never stored. */
  create: (params: CreateSessionParams) => Promise<CreateSessionResult>;
  /** Validate a cookie token → the resolved caller's principal-fields, or `null` for
   *  missing/revoked/expired/disabled. `role`/`enabled` are re-read from the row each request, so a
   *  revoke/role-change/disable propagates on the next request. Slides expiry on a throttle; `onSlide`
   *  fires with the new expiry so the route can refresh the cookie Max-Age. */
  validate: (token: SessionToken, onSlide?: (expiresAt: number) => void) => Promise<ValidatedSession | null>;
  /** Revoke the session a token belongs to (logout); audits `AUTH_LOGOUT`. Returns WHICH session ended, or
   *  `null` if it was already gone — the entry-tier logout route evicts that session's live sockets with it
   *  (W7a; per-SESSION so signing out on the phone leaves the desktop connected). */
  revokeByToken: (token: SessionToken) => Promise<SessionId | null>;
  /** Revoke one session by id (admin: kick a specific device) → WHOSE it was, or `null` if it was already
   *  revoked. The owner is what the entry tier evicts live sockets by (W7a). @internal */
  revoke: (sessionId: SessionId) => Promise<UserId | null>;
  /** Revoke all of a user's live sessions → count revoked. @internal */
  revokeAllForUser: (userId: UserId) => Promise<number>;
  /** A5 — revoke every live session for the user(s) bound to a stable external subject (`sub`), for OIDC
   *  back-channel logout → the count revoked + WHOSE (the entry tier evicts those users' live sockets, W7a).
   *  Idempotent (re-delivered logout tokens re-revoke nothing, and name no users). @internal */
  revokeByExternalId: (externalId: ExternalId) => Promise<RevokedSessionsSummary>;
  /** A user's sessions for the admin device list. @internal */
  listForUser: (userId: UserId) => Promise<SessionView[]>;
  /** Resolve a handle → `UserId`, JIT-creating the row on first sight. @internal */
  ensureUser: (handle: Handle) => Promise<UserId>;
  /** The SSO seam upsert: keys on the stable `externalId`, seeds `role` from owner policy on insert,
   *  preserves `role`/`enabled` on update (unless `RE_DERIVE_ROLE_ON_LOGIN`). `options` carries the
   *  caller-resolved admission decisions (A1 JIT gate / A2 approval) — the verb stays mode-agnostic. @internal */
  provisionIdentity: (identity: ResolvedIdentity, options?: ProvisionIdentityOptions) => Promise<ProvisionResult>;
  /** Resolve a bare row id → its live principal-fields, or `null` for an unknown id. @internal */
  loadUserById: (userId: UserId) => Promise<UserPrincipalFields | null>;
  /** Exact handle→userId. A disabled/unknown handle collapses to null (leak-free; exact match only). */
  resolveHandle: (handle: Handle) => Promise<UserId | null>;
  /** Local password login: resolve `(handle, password)` → the row's `UserId`, or `null` for
   *  unknown/SSO-only/wrong-password/disabled — all collapse into one leak-free null with the same KDF
   *  time burned (no user-enumeration timing oracle). @internal */
  authenticate: (handle: Handle, password: string) => Promise<UserId | null>;
  /** B5 — stamp a stable external subject onto an existing row (the admin "link SSO identity" capability).
   *  The SECOND `externalId` writer after `provisionIdentity`; reuses the bind-once guard and refuses a
   *  subject already bound elsewhere / a row already bound to a different subject (spine U1: one linking
   *  site). Gating + audit are the admin wrapper's — this enforces only the identity invariant. @internal */
  linkExternalId: (userId: UserId, externalId: ExternalId) => Promise<LinkExternalIdResult>;
  /** B4 — is this a fresh local box whose owner row has no password yet (first-run setup pending)? Drives
   *  the `localFirstRun` config flag. @internal */
  ownerNeedsPassword: () => Promise<boolean>;
  /** B4 — ONE-SHOT: claim the owner password (write the hash only when currently null). Returns the owner
   *  `UserId` iff this call set it, else `null` (already claimed) — never overwrites an existing credential. @internal */
  claimOwnerPassword: (passwordHash: string) => Promise<UserId | null>;
}
