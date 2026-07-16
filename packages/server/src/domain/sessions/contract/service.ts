// The typed API surface: `SessionsService` is the authoritative verb listing, `SessionsContext` the DI
// bundle. 12 verbs across the BFF session lifecycle + identity resolution.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { Handle, SessionId, UserId } from "@orb/kit/ids";
import type { CreateSessionParams, ProvisionAgentParams } from "./params";
import type { CreateSessionResult, ProvisionAgentResult, ProvisionResult, UserPrincipalFields, ValidatedSession } from "./results";

/** The DI bundle every verb closes over, wired at the composition root. */
export interface SessionsContext {
  db: Db;
  now: () => number;
  /** The peppered token hasher, bound to `SESSION_SECRET` at the root; throws if the pepper is unset. */
  hashToken: (token: string) => string;
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
  validate: (token: string, onSlide?: (expiresAt: number) => void) => Promise<ValidatedSession | null>;
  /** Revoke the session a token belongs to (logout); audits `AUTH_LOGOUT`. No-op if already gone. */
  revokeByToken: (token: string) => Promise<void>;
  /** Revoke one session by id (admin: kick a specific device). @internal */
  revoke: (sessionId: SessionId) => Promise<void>;
  /** Revoke all of a user's live sessions → count revoked. @internal */
  revokeAllForUser: (userId: UserId) => Promise<number>;
  /** A user's sessions for the admin device list. @internal */
  listForUser: (userId: UserId) => Promise<SessionView[]>;
  /** Resolve a handle → `UserId`, JIT-creating the row on first sight. @internal */
  ensureUser: (handle: string) => Promise<UserId>;
  /** The SSO seam upsert: keys on the stable `externalId`, seeds `role` from owner policy on insert,
   *  preserves `role`/`enabled` on update (unless `RE_DERIVE_ROLE_ON_LOGIN`). @internal */
  provisionIdentity: (identity: ResolvedIdentity) => Promise<ProvisionResult>;
  /** Resolve a bare row id → its live principal-fields, or `null` for an unknown id. @internal */
  loadUserById: (userId: UserId) => Promise<UserPrincipalFields | null>;
  /** Exact handle→userId. A disabled/unknown handle collapses to null (leak-free; exact match only). */
  resolveHandle: (handle: Handle) => Promise<UserId | null>;
  /** Local password login: resolve `(handle, password)` → the row's `UserId`, or `null` for
   *  unknown/SSO-only/wrong-password/disabled — all collapse into one leak-free null with the same KDF
   *  time burned (no user-enumeration timing oracle). @internal */
  authenticate: (handle: string, password: string) => Promise<UserId | null>;
  /** Mint (or idempotently adopt) an agent principal for `(ownerUserId, sourceKind)`. Gates the owner,
   *  inserts the agent `users` row + satellite atomically, audits `AGENT_PRINCIPAL_MINTED`.
   *  `created:false` = idempotent re-call or race loser. FLAG[PD-17]: no production caller until AP3. */
  provisionAgentPrincipal: (params: ProvisionAgentParams) => Promise<ProvisionAgentResult>;
}
