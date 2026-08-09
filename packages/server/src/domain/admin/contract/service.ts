// The typed API surface: AdminContext (the DI bundle), SessionAdminPort/VllmSupervisorPort/EmbedProducerPort
// (dependency-inversion ports into sibling domains), and AdminService (the verb interface). Every
// cross-feature/infra dep arrives as an injected op — admin sideways-imports nothing.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { CharacterId, ExternalId, SessionId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  CreateUserParams,
  EmbedCharacterCardParams,
  LinkSsoIdentityParams,
  ListSessionsParams,
  ListUsersParams,
  ResetPasswordParams,
  RestartVllmEngineParams,
  RevokeSessionParams,
  RevokeUserSessionsParams,
  SetEnabledParams,
  SetRoleParams,
  VllmEnginesParams,
} from "./params.ts";
import type {
  CreateUserResult,
  LinkExternalIdOutcome,
  LinkSsoIdentityResult,
  ListSessionsResult,
  ListUsersResult,
  RevokeUserSessionsResult,
  SetEnabledResult,
  SetRoleResult,
  VllmEnginesResult,
} from "./results.ts";
import type { AdminEngineStatus, SessionAdminView } from "./views.ts";

/** The session-management slice admin needs — satisfied structurally by the real `SessionsService` at the
 *  composition root. Not re-exported from the front door — a private port. */
interface SessionAdminPort {
  readonly listForUser: (userId: UserId) => Promise<readonly SessionAdminView[]>;
  readonly revoke: (sessionId: SessionId) => Promise<void>;
  readonly revokeAllForUser: (userId: UserId) => Promise<number>;
  /** B5 — the injected bind-once linking capability (canonical home domain/sessions `linkExternalId`). admin
   *  gates + audits around it; the identity invariant (bind-once, U1 one-linking-site) is the verb's. */
  readonly linkExternalId: (userId: UserId, externalId: ExternalId) => Promise<LinkExternalIdOutcome>;
}

/** The vLLM-supervisor slice admin needs — satisfied at the root by mapping `infra/providers`' supervisor
 *  handle into this shape. */
interface VllmSupervisorPort {
  readonly allEngineStatuses: () => Record<string, AdminEngineStatus>;
  readonly restartEngine: (engine: string) => Promise<string>;
}

/** The inline-embed slice admin needs — composed at the root from `character` and `embeddings`. Resolves
 *  `false` when the caller doesn't own the character, it's gone, or it has no embeddable text. */
interface EmbedProducerPort {
  readonly embedCharacterCard: (principal: Principal, characterId: CharacterId) => Promise<boolean>;
}

/** The DI bundle the admin verbs close over, wired at the composition root. admin reads `users` directly
 *  (exempt from `no-direct-users-read` — every read here gates first). */
export interface AdminContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newUserId: () => UserId;
  readonly hashPassword: (plain: string) => Promise<string>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly sessions: SessionAdminPort;
  readonly vllm: VllmSupervisorPort;
  readonly embed: EmbedProducerPort;
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
  readonly vllmEngines: (params: VllmEnginesParams) => Promise<VllmEnginesResult>;
  /** Returns the supervisor's own free-form line — prose for a toast, not an identifier (see results.ts). */
  readonly restartVllmEngine: (params: RestartVllmEngineParams) => Promise<string>;
  readonly embedCharacterCard: (params: EmbedCharacterCardParams) => Promise<void>;
}
