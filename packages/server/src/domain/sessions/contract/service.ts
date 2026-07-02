// domain/sessions — the typed API surface (core/Core-0-Architecture-and-Structure.md §4). `SessionsService` is the authoritative
// verb listing (read it to know everything the domain does); `SessionsContext` is the explicit DI bundle
// (movement table: the inferred `ReturnType<>` is invisible at a glance, so the bundle is a hand-written
// interface here — `no-context-returntype` forbids reflecting it off the builder).
//
// 10 verbs across the BFF session lifecycle + identity resolution (sessions.md §"What this domain owns"):
//   create · validate · revokeByToken · revoke · revokeAllForUser · listForUser · ensureUser ·
//   provisionIdentity · loadUserById · authenticate. The seam (`entry/auth/seam.ts`) consumes validate/
//   provisionIdentity/ensureUser to mint the one `Principal` (+ loadUserById for the frozen-host bridge,
//   PD-73); `admin` consumes listForUser/revoke/revokeAllForUser via an injected port; the `entry/http`
//   local-login route consumes authenticate (PD-83).

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { SessionId, UserId } from "@orb/kit/ids";
import type { CreateSessionParams } from "./params";
import type {
  CreateSessionResult,
  ProvisionResult,
  UserPrincipalFields,
  ValidatedSession,
} from "./results";

/**
 * The DI bundle every verb closes over, wired at the composition root (`service.ts`). Explicit interface
 * (not `ReturnType<typeof createSessionsContext>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). Production passes the real clock at `entry/`; tests pass the
 *     frozen clock. No ambient `Date.now()` in a verb (determinism — `no-raw-clock`).
 *   - `hashToken` — the peppered token hasher, bound to `SESSION_SECRET` at the root (D38 — relocated
 *     here from `infra/crypto`; throws if the pepper is unset). The verbs never see the raw pepper.
 */
export interface SessionsContext {
  db: Db;
  now: () => number;
  hashToken: (token: string) => string;
  /** Session lifetime + slide-throttle (ms), injected from the `tokens/` subsystem at the composition
   *  root — a verb reads `ctx.ttlMs`/`ctx.slideThrottleMs`, never imports the subsystem directly
   *  (`domain-substrate-mediates-subsystems`: only the composition surfaces touch `tokens/`). */
  ttlMs: number;
  slideThrottleMs: number;
  /** The infra/auth password VERIFY (PD-83) — bound in `context.ts` from the same `SESSION_SECRET` pepper
   *  as `hashToken` (the token-hasher precedent). Constant-time against a stored `scrypt$…` hash; a null/
   *  malformed stored value is a fast `false` (the VERB supplies the dummy-hash burn — see authenticate). */
  verifyPassword: (plain: string, stored: string | null | undefined) => Promise<boolean>;
}

export interface SessionsService {
  /** Mint an opaque 32-byte token (the route sets it as the cookie) + persist only its peppered hash;
   *  audits `AUTH_LOGIN`. Returns the raw token ONCE (never stored — invariant #3). */
  create: (params: CreateSessionParams) => Promise<CreateSessionResult>;
  /** Validate a cookie token → the resolved caller's principal-fields (incl. `userId`), or `null` for
   *  missing/revoked/expired/disabled. The Route-A identity-resolution step (ledger D40): the cookie→user
   *  read is DOMAIN resolution the `entry/auth/seam` calls DIRECTLY (it returns `userId`, unlike the
   *  removed infra `validateCookie` port). `role` + `enabled` are RE-READ from the row each request, so a
   *  revoke / role-change / disable propagates on the NEXT request (orbweaver is NOT JWT-baked). Slides
   *  expiry on a throttle; `onSlide` fires with the new expiry so the route can refresh the cookie Max-Age. */
  validate: (
    token: string,
    onSlide?: (expiresAt: number) => void,
  ) => Promise<ValidatedSession | null>;
  /** Revoke the session a token belongs to (logout); audits `AUTH_LOGOUT`. No-op if already gone. */
  revokeByToken: (token: string) => Promise<void>;
  /** Revoke one session by id (admin: kick a specific device). @internal — via `SessionAdminPort`. */
  revoke: (sessionId: SessionId) => Promise<void>;
  /** Revoke ALL of a user's live sessions (admin disable / kick-all) → count revoked. @internal — port. */
  revokeAllForUser: (userId: UserId) => Promise<number>;
  /** A user's sessions for the admin device list. @internal — via `SessionAdminPort`. */
  listForUser: (userId: UserId) => Promise<SessionView[]>;
  /** Resolve a handle → `UserId`, JIT-creating the row on first sight (the single-user / owner-fallback
   *  path; keys on `handle`, `externalId` stays NULL). @internal — only the `entry/` seam calls it. */
  ensureUser: (handle: string) => Promise<UserId>;
  /** The SSO seam upsert: keys on the stable `externalId` (rename stability), seeds `role` from the
   *  owner policy on INSERT, preserves `role`/`enabled` on UPDATE (unless `RE_DERIVE_ROLE_ON_LOGIN`).
   *  Returns `{ userId, enabled, role }` so the seam gates (disabled → unauthenticated) + builds the
   *  `Principal`. @internal — only the `entry/` seam calls it. */
  provisionIdentity: (identity: ResolvedIdentity) => Promise<ProvisionResult>;
  /** Resolve a bare row id → its live principal-fields (role/handle/externalId re-read from `users`), or
   *  `null` for an unknown id. The frozen-host → `Principal` bridge (PD-73): chat's D19 ops are keyed by
   *  the frozen host `UserId`, and the D17 role-sensitive ops (max-pro-sub owner-gate) need the host's
   *  REAL role — sessions is the sanctioned `users` reader, so the read homes here. @internal — only the
   *  `entry/auth` seam's `createHostPrincipalResolver` calls it. */
  loadUserById: (userId: UserId) => Promise<UserPrincipalFields | null>;
  /** LOCAL password login (PD-83): resolve `(handle, password)` → the row's `UserId`, or `null` for an
   *  unknown handle / SSO-only (null-hash) row / wrong password / DISABLED row — all four collapse into
   *  one leak-free null, and every path burns the same KDF time (the dummy-hash constant-time floor —
   *  no user-enumeration timing oracle). The route mints the session from the returned id
   *  (`sessions.create`); this verb only RESOLVES. @internal — only the `entry/http` login route calls it. */
  authenticate: (handle: string, password: string) => Promise<UserId | null>;
}
