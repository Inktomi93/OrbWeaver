// The typed API surface: AdminContext (the DI bundle), SessionAdminPort/VllmSupervisorPort/EmbedProducerPort
// (dependency-inversion ports into sibling domains), and AdminService (the verb interface). Every
// cross-feature/infra dep arrives as an injected op — admin sideways-imports nothing.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { CharacterId, SessionId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  CreateUserParams,
  EmbedCharacterCardParams,
  ListSessionsParams,
  ListUsersParams,
  ResetPasswordParams,
  RestartVllmEngineParams,
  RevokeSessionParams,
  RevokeUserSessionsParams,
  SetEnabledParams,
  SetRoleParams,
  VllmEnginesParams,
} from "./params";
import type {
  CreateUserResult,
  ListSessionsResult,
  ListUsersResult,
  RestartVllmEngineResult,
  RevokeUserSessionsResult,
  SetEnabledResult,
  SetRoleResult,
  VllmEnginesResult,
} from "./results";
import type { AdminEngineStatus, SessionAdminView } from "./views";

/** The session-management slice admin needs — satisfied structurally by the real `SessionsService` at the
 *  composition root. Not re-exported from the front door — a private port. */
interface SessionAdminPort {
  readonly listForUser: (userId: UserId) => Promise<readonly SessionAdminView[]>;
  readonly revoke: (sessionId: SessionId) => Promise<void>;
  readonly revokeAllForUser: (userId: UserId) => Promise<number>;
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
  readonly listSessions: (params: ListSessionsParams) => Promise<ListSessionsResult>;
  readonly revokeSession: (params: RevokeSessionParams) => Promise<void>;
  readonly revokeUserSessions: (params: RevokeUserSessionsParams) => Promise<RevokeUserSessionsResult>;
  readonly vllmEngines: (params: VllmEnginesParams) => Promise<VllmEnginesResult>;
  readonly restartVllmEngine: (params: RestartVllmEngineParams) => Promise<RestartVllmEngineResult>;
  readonly embedCharacterCard: (params: EmbedCharacterCardParams) => Promise<void>;
}
