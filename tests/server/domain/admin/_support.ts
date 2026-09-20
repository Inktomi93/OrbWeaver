// Shared test harness for the admin domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db AdminContext with injected determinism (frozen clock + seeded ids) and FAKE
// injected ports/ops (audit/hashPassword/sessions/vllm) — the sanctioned "fake at the edges, inject at the
// root" doctrine (testing §3): these are real injected deps, not internal-module mocks. The fakes RECORD
// their calls so tests assert the verb's behaviour (e.g. existence-before-audit: zero recorded audits).
//
// THE BATCH-RIDING OPS ARE DELIBERATELY REAL, NOT FAKES (#1691, #1707): `auditStatementAfterWrite`,
// `sessions.revokeAllForUserStatement` and `sessions.linkExternalIdStatement` hand back UNEXECUTED statements
// that the privileged verbs commit INSIDE their own write's batch. A recorder there would record a call and
// prove nothing — the property under test is that those rows land in the same transaction as the `users`
// write — so they are wired to the production builders over the test db and the assertions read `users` /
// `audit_logs` / `sessions` themselves (`auditActions` below). `sessions.settleUnclaimedLink` is real for the
// matching reason: the refusal it names is READ BACK from durable state, so a forced outcome would prove
// nothing about what the batch actually did. Both link halves come off a REAL `SessionsService` over the same
// db — production wiring, not a hand-rolled stand-in. The `evictUserSockets` tail stays a recorder: it is the
// one NON-db tail.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { auditLogs, sessions, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { CharacterId, ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import { createAdminService } from "@orb/server/domain/admin";
import { createSessionsService } from "@orb/server/domain/sessions";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import { buildAuditStatementIfPrecedingWrote } from "@orb/server/foundation/observability";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { AdminContext } from "../../../../packages/server/src/domain/admin/context.ts";
import type { UnclaimedLinkOutcome } from "../../../../packages/server/src/domain/admin/contract/results.ts";
import type { SessionAdminView } from "../../../../packages/server/src/domain/admin/contract/views.ts";
import { insertSession, revokeAllForUserStatement } from "../../../../packages/server/src/domain/sessions/persistence/sessions.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { createSeededIds } from "../../../support/ids.ts";

interface AuditCall {
  readonly entry: Parameters<AdminContext["audit"]>[0];
  readonly at: number;
}

/** #1691 — the durable audit rows the batched verbs wrote, oldest first. The privileged verbs
 *  (create/reset-password/set-role/set-enabled) commit their audit row INSIDE the write's batch, so their
 *  record is a real `audit_logs` row, never a recorded call on {@link AdminHarness.audits}. */
export async function auditActions(db: Db): Promise<string[]> {
  const rows = await db.select({ action: auditLogs.action }).from(auditLogs).orderBy(asc(auditLogs.createdAt));
  return rows.map((r) => r.action);
}

/** #1691 — seed one LIVE session for `userId` (the state every kick-tail assertion needs: a reset/disable
 *  for a signed-out user revokes nothing, which proves nothing). Returns its id. */
export async function seedLiveSession(db: Db, userId: UserId, id = `sess_${userId}`): Promise<SessionId> {
  const sessionId = castId<SessionId>(id);
  await insertSession(db, {
    id: sessionId,
    userId,
    tokenHash: `hash_${id}`,
    createdAt: FROZEN_AT,
    lastSeenAt: FROZEN_AT,
    expiresAt: FROZEN_AT + HOUR_MS,
    userAgent: null,
    oidcIdToken: null,
  });
  return sessionId;
}

/** The ids of `userId`'s sessions that are still LIVE (not revoked). */
export async function liveSessionIds(db: Db, userId: UserId): Promise<SessionId[]> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  return rows.map((r) => r.id);
}

/** #1691 — a context whose ATOMIC AUDIT CHANNEL FAILS, for real and for the production reason: the insert is
 *  the same builder the verbs use, aimed at an actor id that has no `users` row, so it dies on
 *  `audit_logs.actor_user_id`'s FK. Not a mock — a genuinely rejecting audit write, which is exactly what
 *  `logAudit`'s suppress-and-drop posture exists to absorb for the NON-privileged callers. A privileged verb
 *  built over this ctx must leave NO trace of its write. */
export function withBrokenAudit(ctx: AdminContext, db: Db): AdminContext {
  return {
    ...ctx,
    auditStatementAfterWrite: (entry, at): BatchStmt =>
      buildAuditStatementIfPrecedingWrote(db, { ...entry, actorUserId: castId<UserId>("user_no_such_actor") }, at),
  };
}

/** #1691 — a context whose SESSION KICK FAILS: the statement re-points a live session row at a user that
 *  does not exist, so it dies on `sessions.user_id`'s FK the way a real revoke would die on a db fault. The
 *  target must hold a live session (see {@link seedLiveSession}) or the UPDATE matches nothing and cannot
 *  fail. */
export function withBrokenKick(ctx: AdminContext, db: Db): AdminContext {
  return {
    ...ctx,
    sessions: {
      ...ctx.sessions,
      revokeAllForUserStatement: (userId): BatchStmt =>
        db
          .update(sessions)
          .set({ userId: castId<UserId>("user_no_such_owner") })
          .where(eq(sessions.userId, userId))
          .returning({ id: sessions.id }),
    },
  };
}

/** #1707 — a context whose BIND STATEMENT fails for a real database reason: the claim aims the row's
 *  `owner_user_id` at another user, which a human row may not carry (`users_human_shape` CHECK), so the
 *  statement REJECTS the way a real bind would die on a db fault. Used to prove the batch is atomic in the
 *  other direction — a failed bind leaves no audit row claiming the account was linked. */
export function withBrokenBind(ctx: AdminContext, db: Db): AdminContext {
  return {
    ...ctx,
    sessions: {
      ...ctx.sessions,
      linkExternalIdStatement: (userId, externalId, at) =>
        db.update(users).set({ externalId, updatedAt: at, ownerUserId: userId }).where(eq(users.id, userId)).returning({ id: users.id }),
    },
  };
}

export interface AdminHarness {
  readonly ctx: AdminContext;
  /** The BEST-EFFORT audit channel's recorded calls — the advisory verbs only (listSessions/revokeSession/
   *  linkSsoIdentity/vllm/embed). A privileged write's audit is a db row: see {@link auditActions}. */
  readonly audits: AuditCall[];
  readonly revokedAll: UserId[];
  /** #1691 — the W7a live-socket evictions, now a tail of their own (the DB revoke rides the verb's batch). */
  readonly evictedSockets: UserId[];
  readonly revokedSessions: string[];
  /** W7b — the recorded `identityChanged` fans. Recorded with the CHANNEL, because the load-bearing property
   *  is WHOSE channel: admin is the one producer whose write lands on somebody else's row, so an emit to the
   *  acting admin instead of the target would announce a grant to everyone except its recipient. */
  readonly userEvents: { userId: UserId; event: UserBusEvent }[];
  /** The recorded inline-embed port calls (PD-90); embeds resolve `true` unless `setEmbedOwned(false)`. */
  readonly embedded: { principal: Principal; characterId: CharacterId }[];
  /** Flip the fake embed port's ownership answer (false = not-owned/missing → the verb's not-found). */
  readonly setEmbedOwned: (owned: boolean) => void;
}

const FROZEN_AT = 1_750_000_000_000;
const HARNESS_PEPPER = "test-session-secret-at-least-32-chars-long";
const HOUR_MS = 3_600_000;

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
  readonly role?: UserRole;
  readonly enabled?: boolean;
  readonly passwordHash?: string | null;
}

/** Insert a `users` row with deterministic defaults; returns its branded id. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? overrides.role ?? "x"}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
    enabled: overrides.enabled ?? true,
    passwordHash: overrides.passwordHash ?? null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Build a Principal for a given user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — admin keeps the positional `(id, role, handle?)` convention its ~40
 *  call sites use; the shared home owns the literal (role/handle over the `overrides` axis). */
export function principal(userId: UserId, role: UserRole, handle: Handle = castId<Handle>(userId)): Principal {
  return makePrincipal(userId, { role, handle });
}

/** The repeated "wire the service, seed the admin caller" prologue (~7 call sites): builds a real
 *  `AdminService` over a fresh harness and seeds a `user_adm` admin-role caller. */
export async function seedAdminCaller(db: Db): Promise<{ svc: AdminService; admin: UserId }> {
  const svc = createAdminService(makeHarness(db).ctx);
  const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
  return { svc, admin };
}

export function makeHarness(db: Db): AdminHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const revokedAll: UserId[] = [];
  const evictedSockets: UserId[] = [];
  const revokedSessions: string[] = [];
  const userEvents: { userId: UserId; event: UserBusEvent }[] = [];
  const embedded: { principal: Principal; characterId: CharacterId }[] = [];
  let embedOwned = true;
  const sessionList: SessionAdminView[] = [];

  // #1707 — the REAL link capability over the same test db (see the header): the bind statement rides the
  // verb's audited batch and the settlement is read back from durable state.
  const sessionsSvc = createSessionsService({
    db,
    now: () => clock.now(),
    sessionSecret: HARNESS_PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: () => clock.now() }),
  });

  const ctx: AdminContext = {
    db,
    now: (): number => clock.now(),
    newUserId: (): UserId => castId<UserId>(ids.next("user")),
    hashPassword: (plain: string): Promise<string> => Promise.resolve(`scrypt$test$${plain}`),
    // #2481 — REAL, for the same reason the batch-riding statements above are (see the header): the
    // property under test is that a minted account ends up holding `user_connections` rows, so a
    // recorder here would pass while the seed it stands for was gone. Same op the composition root
    // builds.
    seedUserConnections: createLocalLightUserSeed({ db, now: () => clock.now() }),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    // #1691 — the ATOMIC audit channel is NOT faked: the verbs' whole point is that the row commits inside
    // the privileged write's batch, so the harness wires the REAL builder over the test db and the assertions
    // read `audit_logs`. A recorder here would pass while the atomicity it exists to prove was gone.
    auditStatementAfterWrite: (entry: AuditCall["entry"], at: number): BatchStmt => buildAuditStatementIfPrecedingWrote(db, entry, at),
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    sessions: {
      listForUser: (_userId: UserId): Promise<readonly SessionAdminView[]> => Promise.resolve(sessionList),
      revoke: (sessionId: SessionId): Promise<void> => {
        revokedSessions.push(sessionId);
        return Promise.resolve();
      },
      revokeAllForUser: (userId: UserId): Promise<number> => {
        revokedAll.push(userId);
        return Promise.resolve(revokedAll.length);
      },
      // #1691 — REAL, for the same reason as the audit statement: it rides the verb's batch, so a fake would
      // erase the atomicity under test. Tests assert against the `sessions` rows themselves.
      revokeAllForUserStatement: (userId: UserId, revokedAt: number): BatchStmt => revokeAllForUserStatement(db, userId, revokedAt),
      evictUserSockets: (userId: UserId): void => {
        evictedSockets.push(userId);
      },
      linkExternalIdStatement: sessionsSvc.linkExternalIdStatement,
      settleUnclaimedLink: (userId: UserId, externalId: ExternalId, failure?: unknown): Promise<UnclaimedLinkOutcome> =>
        sessionsSvc.settleUnclaimedLink(userId, externalId, failure),
    },

    embed: {
      embedCharacterCard: (caller: Principal, characterId: CharacterId): Promise<boolean> => {
        if (!embedOwned) {
          return Promise.resolve(false);
        }
        embedded.push({ principal: caller, characterId });
        return Promise.resolve(true);
      },
    },
  };

  return {
    ctx,
    audits,
    revokedAll,
    evictedSockets,
    revokedSessions,
    userEvents,

    embedded,
    setEmbedOwned: (owned: boolean): void => {
      embedOwned = owned;
    },
  };
}
