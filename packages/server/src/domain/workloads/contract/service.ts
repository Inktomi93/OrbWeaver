// domain/workloads/contract/service — the typed API surface. Holds the `WorkloadService` verb interface,
// the two explicit DI bundles, and the injected-op type aliases; `context.ts` is the builder for these types.
// workloads sideways-imports NO sibling runtime — every cross-feature capability is an injected op wired at entry/.

import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type { IsAdmin, RequireOwner } from "../../admin/contract/guard";
import type {
  CancelWorkloadParams,
  CancelWorkloadResult,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
  StartWorkloadParams,
} from "./params";
import type { WorkloadRunnerEnv } from "./runner-env";
import type { WorkloadScheduleService } from "./schedule";
import type { WorkloadRowAnyKind } from "./workload-row";

/** Mint a fresh `WorkloadId` — the injected determinism seam. */
type NewWorkloadId = () => WorkloadId;

/** Mint a fresh `WorkloadScheduleId` — the injected determinism seam for the schedule verbs. */
type NewWorkloadScheduleId = () => WorkloadScheduleId;

/** Bind a `RoleClients` bundle for a specific acting user. REQUIRED — no default-role fallback. */
type BindRoleClients = (ownerId: UserId) => Promise<RoleClients>;

/** Read a user's parsed `UserSettings`, injected from `settings`. */
type LoadUserSettings = (userId: UserId) => Promise<UserSettings>;

/** The bundle the `WorkloadService` verbs close over (built by `context.ts`, wired at `service.ts`). */
export interface WorkloadServiceContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newWorkloadId: NewWorkloadId;
  readonly newScheduleId: NewWorkloadScheduleId;
  /** MODE authz seam: `requireOwner` gates a BULK run (owner-only); `isAdmin` chooses the read scope. */
  readonly requireOwner: RequireOwner;
  readonly isAdmin: IsAdmin;
}

/** What `createWorkloadService` receives from the entry root (identical to the context — no transform). */
export type WorkloadServiceDeps = WorkloadServiceContext;

/**
 * The base runner deps the entry root wires + the worker holds. Lease/heartbeat cadences are tunable and
 * `<= 0` disables the timers (deterministic test seam — a test drives cancel via `AbortSignal` instead).
 */
export interface WorkloadRunnerDeps {
  readonly db: Db;
  readonly env: WorkloadRunnerEnv;
  readonly bindRoleClients: BindRoleClients;
  readonly loadUserSettings: LoadUserSettings;
  /** Suppress-and-drop audit writer; the engine emits `WORKLOAD_FAILED` on a terminal runtime failure. */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly now: () => number;
  readonly heartbeatMs?: number;
  readonly cancelPollMs?: number;
}

/**
 * The per-dispatch bundle a `Runner<K>` closes over. `ownerId` is the RAW row owner (`null` for a BULK
 * all-owners sweep) — the enumeration scope a runner passes to its `env` op. No `db` — a runner reaches
 * persistence only through `env.<feature>.<op>()`.
 */
export interface WorkloadRunnerContext {
  readonly userId: UserId;
  readonly ownerId: UserId | null;
  readonly roleClients: RoleClients;
  readonly loadUserSettings: () => Promise<UserSettings>;
  readonly env: WorkloadRunnerEnv;
  readonly now: () => number;
}

/** The `WorkloadService` surface; every verb threads `caller` as the F3 authorization subject (`null` = trusted system trigger). */
export interface WorkloadService extends WorkloadScheduleService {
  readonly start: (params: StartWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly cancel: (params: CancelWorkloadParams) => Promise<CancelWorkloadResult>;
  readonly retry: (params: RetryWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly get: (params: GetWorkloadParams) => Promise<WorkloadRowAnyKind>;
  readonly list: (params: ListWorkloadsParams) => Promise<readonly WorkloadRowAnyKind[]>;
}
