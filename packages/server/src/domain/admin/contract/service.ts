// The typed API surface: AdminContext (the DI bundle), SessionAdminPort/EmbedProducerPort
// (dependency-inversion ports into sibling domains), and AdminService (the verb interface). Every
// cross-feature/infra dep arrives as an injected op — admin sideways-imports nothing.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import type { CharacterId, ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  CreateUserParams,
  EmbedCharacterCardParams,
  LinkSsoIdentityParams,
  ListSessionsParams,
  ListUsersParams,
  ResetPasswordParams,
  RestartParams,
  RevokeSessionParams,
  RevokeUserSessionsParams,
  SetEnabledParams,
  SetRoleParams,
} from "./params.ts";
import type {
  CreateUserResult,
  LinkSsoIdentityResult,
  ListSessionsResult,
  ListUsersResult,
  RevokeUserSessionsResult,
  SetEnabledResult,
  SetRoleResult,
  UnclaimedLinkOutcome,
} from "./results.ts";
import type { SessionAdminView } from "./views.ts";

/** The session-management slice admin needs — satisfied structurally by the real `SessionsService` at the
 *  composition root. Not re-exported from the front door — a private port. */
interface SessionAdminPort {
  readonly listForUser: (userId: UserId) => Promise<readonly SessionAdminView[]>;
  readonly revoke: (sessionId: SessionId) => Promise<void>;
  readonly revokeAllForUser: (userId: UserId) => Promise<number>;
  /** #1691 — the UNEXECUTED kick-all, so a credential/authority write can commit its own session kick in ONE
   *  batch instead of awaiting it afterwards (a failed tail used to leave the NEW password live beside the
   *  OLD sessions). Canonical home `domain/sessions`; admin only orders the statements. */
  readonly revokeAllForUserStatement: (userId: UserId, revokedAt: number) => BatchStmt;
  /** #1691 — W7a's live-socket half, split out of the executed `revokeAllForUser` wrapper because the DB
   *  revoke now rides the caller's batch while the eviction can only happen AFTER it commits. The one tail
   *  that is NOT a DB write: a synchronous in-process registry walk
   *  (`transport/trpc/stream/socket-registry.ts` `evictUser`), injected as a port because a domain may not
   *  import transport. Total by construction and idempotent — nothing durable depends on it, because the
   *  committed revoke is what `sessions.validate` refuses on the socket's next request. */
  readonly evictUserSockets: (userId: UserId) => void;
  /** B5/#1707 — the injected bind-once link, UNEXECUTED, so the admin verb can commit the identity bind and
   *  its audit row as ONE batch (before this the bind ran inside the sessions capability and its audit was
   *  the best-effort `audit` above, so a dead audit channel returned 200 for an unaudited SSO bind).
   *  Canonical home domain/sessions; admin only orders the statements. NON-EMPTY rows = bound. */
  readonly linkExternalIdStatement: (userId: UserId, externalId: ExternalId, at: number) => AwaitableBatchStmt<{ readonly id: UserId }[]>;
  /** B5/#1707 — the companion read for a claim that bound nothing or whose batch rejected: names the
   *  identity refusal from SETTLED durable state, or RETHROWS the caller's `failure` when durable state does
   *  not explain it (so a broken audit insert surfaces as itself, never as a fake identity refusal). The
   *  identity invariant (bind-once, U1 one-linking-site) stays the sessions verb's. */
  readonly settleUnclaimedLink: (userId: UserId, externalId: ExternalId, failure?: unknown) => Promise<UnclaimedLinkOutcome>;
  /** D256 — the local-account mint, UNEXECUTED, so `createUser` commits it with its audit row as ONE batch.
   *  Canonical home domain/sessions, which derives the handle key; admin only orders the statements. */
  readonly localUserInsertStatement: (row: {
    readonly id: UserId;
    readonly handle: Handle;
    readonly role: UserRole;
    readonly passwordHash: string;
    readonly at: number;
  }) => AwaitableBatchStmt<{ readonly id: UserId }[]>;
}

/** The inline-embed slice admin needs — composed at the root from `character` and `embeddings`. Resolves
 *  `false` when the caller doesn't own the character, it's gone, or it has no embeddable text. */
interface EmbedProducerPort {
  readonly embedCharacterCard: (principal: Principal, characterId: CharacterId) => Promise<boolean>;
}

/** The process restart the composition root owns (`entry/lifecycle.ts`), injected because a domain may neither close
 *  the app nor end the process. */
export interface ServerRestartPort {
  /** True when the launcher that respawns on the restart exit code started this process (`@orb/kit/supervisor`). */
  readonly supervised: boolean;
  /** Closes the app and exits with the restart code on a later tick, so the caller's answer is sent first. Never throws. */
  readonly restart: () => void;
}

/** The DI bundle the admin verbs close over, wired at the composition root. admin reads `users` directly
 *  (exempt from `no-direct-users-read` — every read here gates first). */
export interface AdminContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newUserId: () => UserId;
  readonly hashPassword: (plain: string) => Promise<string>;
  /** #2481 / inference program §5.3b — the minted account's local-light vector floor, as an INJECTED op:
   *  `domain/admin` may not import `domain/connection`. Called by `createUser` AFTER `commitAuditedWrite`'s
   *  batch commits, NEVER inside it — a failed convenience seed must not un-create an account (which is the
   *  exact inverse of the {@link AdminContext.auditStatementAfterWrite} bargain one field below, and the two
   *  are different on purpose: an unauditable privileged mint must not happen, an unseeded one merely needs
   *  repairing). TOTAL by contract — the composition root owns the degrade and logs the warning the
   *  connection pane repairs. Required, not optional: a compose site that forgets it mints accounts with no
   *  vector floor and nothing fails. */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
  /** The BEST-EFFORT audit channel (`logAudit`: suppress → count → drop) — correct for the read-ish and
   *  advisory verbs (`listSessions`/`revokeSession`/`embed`), where a degraded audit channel must not
   *  break the action. NOT for a privileged durable write: those take
   *  {@link AdminContext.auditStatementAfterWrite} (#1691, and #1707 for `linkSsoIdentity` — an SSO BIND is
   *  a durable identity write, so it left this channel). */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /**
   * #1691 — the ATOMIC audit channel for a privileged write (create/reset-password/set-role/set-enabled,
   * + linkSsoIdentity since #1707):
   * an UNEXECUTED insert that rides the write's own `db.batch`, guarded so the row lands IF AND ONLY IF the
   * statement immediately before it changed a row.
   *
   * The bargain is deliberately the INVERSE of `audit`'s: here an audit failure ROLLS BACK the privileged
   * write. Before this, both directions were broken — in production `audit` is `logAudit`, which swallows,
   * so a failed audit returned 200 for an unaudited account mint / role grant; and a tail that DID reject
   * (the session revoke) rejected the endpoint with the privileged write already committed.
   *
   * ORDER IS THE CONTRACT (`changes()` is connection-local): never hand-assemble the batch — build it with
   * `substrate/audited-write.ts::commitAuditedWrite`, which is the only site that orders the pair.
   */
  readonly auditStatementAfterWrite: (entry: AuditEntry, at: number) => BatchStmt;
  /**
   * The per-user freshness plane (`identityChanged`) — injected, never a sideways reach at the bus (D38).
   *
   * THE ARGUMENT IS THE **TARGET**, NOT THE ACTOR. Every other user-bus producer emits to
   * `principal.userId` because the writer owns the row it wrote; admin is the one domain whose writes land on
   * SOMEBODY ELSE'S identity, so the channel is `params.userId` and the acting admin is told nothing (their
   * own `admin.listUsers` is writer-local and `invalidates` itself — see that key's cited
   * `query-freshness-coverage` entry). Getting this backwards would announce a grant to everyone except the
   * person who received it, which is precisely the D5 gap this closes.
   *
   * FLAG[emit-is-total] — satisfied BY CONSTRUCTION: the op is synchronous, `void`-returning and
   * non-throwing (transport's `publishUserEvent` → `defineBusChannel.publish`, live-only, no durable row, no
   * FK), so the user-bus rule is the simple one every producer follows — emit AFTER the durable write
   * commits. No classify-and-drop wrapper (that is the chat bus's problem, where a `void emit()` over a
   * rejectable durable insert is a process kill).
   */
  readonly emitUserEvent: EmitUserEvent;
  readonly sessions: SessionAdminPort;
  readonly embed: EmbedProducerPort;
  readonly serverRestart: ServerRestartPort;
}

/** The user-administration + gating surface. All verbs are global-role gated in their own body: requireAdmin
 *  (owner ∪ admin) except `setRole`, which is owner-only. */
export interface AdminService {
  readonly listUsers: (params: ListUsersParams) => Promise<ListUsersResult>;
  readonly setRole: (params: SetRoleParams) => Promise<SetRoleResult>;
  readonly setEnabled: (params: SetEnabledParams) => Promise<SetEnabledResult>;
  readonly createUser: (params: CreateUserParams) => Promise<CreateUserResult>;
  readonly resetPassword: (params: ResetPasswordParams) => Promise<void>;
  /** B5 — link an existing non-owner human row to a stable SSO subject (the db-surgery-free mode-switch
   *  migration path). Owner/agent targets and a subject bound elsewhere are refused. */
  readonly linkSsoIdentity: (params: LinkSsoIdentityParams) => Promise<LinkSsoIdentityResult>;
  readonly listSessions: (params: ListSessionsParams) => Promise<ListSessionsResult>;
  readonly revokeSession: (params: RevokeSessionParams) => Promise<void>;
  readonly revokeUserSessions: (params: RevokeUserSessionsParams) => Promise<RevokeUserSessionsResult>;
  readonly embedCharacterCard: (params: EmbedCharacterCardParams) => Promise<void>;
  /** Owner-only: close the app and exit with the restart code. Refuses an unsupervised process and a second call. */
  readonly restart: (params: RestartParams) => Promise<void>;
}
