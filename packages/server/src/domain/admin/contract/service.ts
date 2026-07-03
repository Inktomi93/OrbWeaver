// domain/admin/contract/service — the typed API surface (read THIS to know everything admin does). Holds:
//   • AdminContext       the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • SessionAdminPort   the dependency-inversion port admin needs from `domain/sessions`
//   • VllmSupervisorPort the port admin needs from `infra/providers` (the vLLM supervisor)
//   • EmbedProducerPort  the port admin needs for the inline single-card embed (PD-90)
//   • AdminService       the 11-verb authoritative interface (the front door re-exports the type)
// Every cross-feature/infra dep arrives as an INJECTED op (admin sideways-imports nothing; it reads the
// `Principal` it is handed and gates on it — domain-no-cross-feature, spine §1).

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
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

/**
 * The session-management slice admin needs — satisfied structurally by the real `SessionsService` at the
 * composition root (admin declares the slice; sessions provides it; NO sideways import). NOT re-exported
 * from the front door — a private port. `revokeAllForUser` returns the count for the disable/reset tail.
 */
export interface SessionAdminPort {
  readonly listForUser: (userId: UserId) => Promise<readonly SessionAdminView[]>;
  readonly revoke: (sessionId: string) => Promise<void>;
  readonly revokeAllForUser: (userId: UserId) => Promise<number>;
}

/**
 * The vLLM-supervisor slice admin needs — satisfied at the root by mapping `infra/providers`' supervisor
 * handle into this shape (the infra `EngineStatusRecord` vocab is sealed inside infra; admin owns
 * `AdminEngineStatus`). `restartEngine` resolves with the supervisor's human-oriented status line.
 */
export interface VllmSupervisorPort {
  readonly allEngineStatuses: () => Record<string, AdminEngineStatus>;
  readonly restartEngine: (engine: string) => Promise<string>;
}

/**
 * The inline-embed slice admin needs (PD-90) — composed at the root from `character` (the OWNER-SCOPED
 * card read + the card-text projection: the producer-ownership check that made this a composition, not a
 * thin driver) and `embeddings` (the ONE write path, `store(kind:'card', lens:'card-text')`). Resolves
 * `false` when the caller does not own the character / it is gone / it has no embeddable text — the verb
 * maps that to a leak-free not-found. The bulk path stays the admin-only `embed-corpus` workload.
 */
export interface EmbedProducerPort {
  readonly embedCharacterCard: (principal: Principal, characterId: CharacterId) => Promise<boolean>;
}

/**
 * The DI bundle the admin verbs close over (wired at `service.ts`). `now`/`newUserId` are the injected
 * determinism seam (no ambient clock/id — testing §3); `hashPassword` is `infra/auth`'s sealed adapter;
 * `audit` is `foundation/observability`'s `logAudit` pre-bound to `db`. admin reads `users` directly (the
 * `no-direct-users-read` chokepoint exempts admin — every read here gates first).
 */
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

/**
 * The user-administration + gating surface. All verbs are global-role gated in their own body
 * (defense-in-depth, independent of the transport `adminMiddleware`): `requireAdmin` (owner ∪ admin)
 * except `setRole`, which is `requireOwner` (owner-only — only the owner grants/revokes `admin`, D17).
 */
export interface AdminService {
  readonly listUsers: (params: ListUsersParams) => Promise<ListUsersResult>;
  readonly setRole: (params: SetRoleParams) => Promise<SetRoleResult>;
  readonly setEnabled: (params: SetEnabledParams) => Promise<SetEnabledResult>;
  readonly createUser: (params: CreateUserParams) => Promise<CreateUserResult>;
  readonly resetPassword: (params: ResetPasswordParams) => Promise<void>;
  readonly listSessions: (params: ListSessionsParams) => Promise<ListSessionsResult>;
  readonly revokeSession: (params: RevokeSessionParams) => Promise<void>;
  readonly revokeUserSessions: (
    params: RevokeUserSessionsParams,
  ) => Promise<RevokeUserSessionsResult>;
  readonly vllmEngines: (params: VllmEnginesParams) => Promise<VllmEnginesResult>;
  readonly restartVllmEngine: (params: RestartVllmEngineParams) => Promise<RestartVllmEngineResult>;
  readonly embedCharacterCard: (params: EmbedCharacterCardParams) => Promise<void>;
}
