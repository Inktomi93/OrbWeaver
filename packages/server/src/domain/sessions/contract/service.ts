// The typed API surface: `SessionsService` is the authoritative verb listing, `SessionsContext` the DI
// bundle. 13 verbs across the BFF session lifecycle + identity resolution.

import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import type { ExternalId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import type { Sealed } from "#infra/crypto";
import type { CreateSessionParams, ProvisionIdentityOptions } from "./params.ts";
import type {
  CreateSessionResult,
  PendingSignupPlan,
  ProvisionResult,
  RevokedSession,
  RevokedSessionsSummary,
  UnclaimedLinkOutcome,
  UserPrincipalFields,
  ValidatedSession,
} from "./results.ts";

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
  /** #141 — seal the OIDC `id_token` for at-rest storage on ITS OWN session row. The `sessionId` is the
   *  GCM AAD, not a lookup key: sealing against row A and storing on row B produces a blob that can never
   *  be opened. Key = HKDF over the same `SESSION_SECRET`, bound at `context.ts` (the one AAD site). */
  sealIdToken: (idToken: string, sessionId: SessionId) => Sealed;
  /** #141 — open a sealed id_token bound to `sessionId`. THROWS on a wrong key / lifted row / tampered tag
   *  (GCM verifies before it returns a byte); `verbs/revoke` owns the degrade, because a logout must end
   *  the session whether or not the end-session HINT survives. */
  openIdToken: (sealed: Sealed, sessionId: SessionId) => string;
  /** #2481 / inference program §5.3b — the new account's local-light vector floor, as an INJECTED op:
   *  `domain/sessions` may not import `domain/connection`, so the composition root hands the seed in and the
   *  two minting verbs call it once their `users` row has SETTLED. Deliberately REQUIRED, not optional — the
   *  defect it closes is a mint site that silently seeds nothing, and an optional field would let the next
   *  composition root reintroduce exactly that without failing `tsc`.
   *
   *  TOTAL by contract: it resolves whatever happens. A convenience seed may never fail a login — the
   *  composition root (`entry/boot/seed-local-light.ts`) owns the degrade and logs the warning the connection
   *  pane repairs. Idempotent by the `(owner_id, label)` unique, so the `onConflictDoNothing` loser calling it
   *  for the WINNER's id double-seeds nothing. */
  seedUserConnections: (userId: UserId) => Promise<void>;
  /** D254 — mint the fresh secret a pending OIDC join rides in its cookie (256 bits of CSPRNG entropy). */
  mintPendingSecret: () => string;
  /** D254 — the peppered, domain-separated hash of a pending-join secret: the pending row's only lookup key. */
  hashPendingSecret: (secret: string) => string;
  /** D254 — seal and open the pending row's id_token; the AAD is the row's secret hash, so a blob lifted to
   *  another row fails GCM verification. */
  sealPendingIdToken: (idToken: string, secretHash: string) => Sealed;
  openPendingIdToken: (sealed: Sealed, secretHash: string) => string;
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
  /** Revoke the session a token belongs to (logout); audits `AUTH_LOGOUT`. Returns WHICH session ended plus
   *  its OIDC end-session hint, or `null` if it was already gone — the entry-tier logout route evicts that
   *  session's live sockets with it (W7a; per-SESSION so signing out on the phone leaves the desktop
   *  connected) and appends the hint to the IdP end-session URL (#141). The hint is CONSUMED here: the same
   *  call that flips `revokedAt` clears the stored blob, so it is readable exactly once. */
  revokeByToken: (token: SessionToken) => Promise<RevokedSession | null>;
  /** Revoke one session by id (admin: kick a specific device) → WHOSE it was, or `null` if it was already
   *  revoked. The owner is what the entry tier evicts live sockets by (W7a). @internal */
  revoke: (sessionId: SessionId) => Promise<UserId | null>;
  /** Revoke all of a user's live sessions → count revoked. @internal */
  revokeAllForUser: (userId: UserId) => Promise<number>;
  /** The UNEXECUTED form of {@link SessionsService.revokeAllForUser} — the same atomic UPDATE, handed to a
   *  caller that must commit the kick INSIDE its own privileged write's `db.batch` rather than after it
   *  (#1691: `admin.resetPassword`'s revoke used to be a separate await, so a failed kick left the NEW
   *  password live with the OLD sessions). The revoke instant is the caller's, so one clock stamps the whole
   *  batch. It does NOT evict live sockets — that is the entry-tier port (W7a), after the commit. @internal */
  revokeAllForUserStatement: (userId: UserId, revokedAt: number) => BatchStmt;
  /** A5 — revoke every live session for the user(s) bound to a stable external subject (`sub`), for OIDC
   *  back-channel logout → the count revoked + WHOSE (the entry tier evicts those users' live sockets).
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
  /** B5 — the UNEXECUTED bind: stamp a stable external subject onto an existing row (the admin "link SSO
   *  identity" capability), handed back unrun so the caller commits it INSIDE its own privileged write's
   *  `db.batch` (#1707 — the bind and its audit row are one atomic unit, or a link returns 200 unaudited).
   *  The SECOND `externalId` writer after `provisionIdentity` and the SAME single atomic claim (spine U1:
   *  one linking site), so the bind-once condition rides in the statement's own WHERE. NON-EMPTY rows back
   *  = bound; EMPTY = nothing was bound, and {@link SessionsService.settleUnclaimedLink} says why. Gating +
   *  audit are the admin wrapper's — this enforces only the identity invariant. @internal */
  linkExternalIdStatement: (userId: UserId, externalId: ExternalId, at: number) => AwaitableBatchStmt<{ id: UserId }[]>;
  /** B5/#1707 — the companion read for a claim that bound nothing (empty RETURNING) or whose batch REJECTED:
   *  re-reads settled durable state and names the identity refusal (`already-linked`/`not-found`/
   *  `target-bound`/`subject-taken`). `failure` is the caller's rejection, if any — when durable state does
   *  not explain it, it was never an identity refusal and the original error is RETHROWN unchanged (a failed
   *  audit insert riding the same batch lands there). @internal */
  settleUnclaimedLink: (userId: UserId, externalId: ExternalId, failure?: unknown) => Promise<UnclaimedLinkOutcome>;
  /** The current owner's id, or `undefined` when no owner row exists yet (a fresh OIDC box before the
   *  first owner-policy login). Used by boot to decide whether owner-dependent seeds can run. @internal */
  getOwnerUserId: () => Promise<UserId | undefined>;
  /** D254 — the UNEXECUTED signup account insert with its freshly minted id, for chat's signup batch. It
   *  writes only where `admission` (chat's opaque invite predicate) holds and no row holds the handle's key
   *  (D257), and it never absorbs a unique conflict. @internal */
  signupUserStatement: (args: { readonly handle: Handle; readonly passwordHash: string; readonly at: number; readonly admission: SQL }) => {
    readonly userId: UserId;
    readonly statement: AwaitableBatchStmt<{ id: UserId }[]>;
  };
  /** D257 — does any account carry this handle's key (any case, any confusable)? @internal */
  signupHandleTaken: (handle: Handle) => Promise<boolean>;
  /** D257 — admin's local-account mint, UNEXECUTED, for its audited batch; the handle key is derived here and
   *  a race throws rather than being absorbed. @internal */
  localUserInsertStatement: (row: {
    readonly id: UserId;
    readonly handle: Handle;
    readonly role: UserRole;
    readonly passwordHash: string;
    readonly at: number;
  }) => AwaitableBatchStmt<{ id: UserId }[]>;
  /** D257 — boot's owner seed-key rename; the handle key moves with the handle. @internal */
  renameUserHandle: (userId: UserId, handle: Handle, at: number) => Promise<void>;
  /** D254 — freeze a JIT-closed OIDC identity that arrived with a signup invite as a pending join, replacing
   *  any earlier one for the subject; returns the raw secret for the pending cookie. @internal */
  recordPendingSignup: (args: {
    readonly identity: ResolvedIdentity & { readonly externalId: ExternalId };
    readonly inviteTokenHash: string;
    readonly idToken: string | null;
  }) => Promise<string>;
  /** D254 — the invite hash of the live pending join under this raw secret, or null. Reads only. @internal */
  readPendingSignup: (secret: string) => Promise<{ readonly inviteTokenHash: string } | null>;
  /** D254 — the confirm's plan for the live pending join under this raw secret, or null when there is none
   *  or the frozen identity may no longer join: the access gate refuses, it is the owner, or it now matches
   *  an account. @internal */
  preparePendingSignup: (args: { readonly secret: string; readonly requireApproval: boolean }) => Promise<PendingSignupPlan | null>;
  /** B4 — is this a fresh local box whose owner row has no password yet (first-run setup pending)? Drives
   *  the `localFirstRun` config flag. @internal */
  ownerNeedsPassword: () => Promise<boolean>;
  /** B4 — ONE-SHOT: claim the owner password (write the hash only when currently null). Returns the owner
   *  `UserId` iff this call set it, else `null` (already claimed) — never overwrites an existing credential. @internal */
  claimOwnerPassword: (passwordHash: string) => Promise<UserId | null>;
}
