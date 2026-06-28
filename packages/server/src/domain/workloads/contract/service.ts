// domain/workloads/contract/service — the typed API surface (read THIS to know everything the domain does).
// Holds the `WorkloadService` verb interface, the TWO explicit DI bundles (the verb-facing
// `WorkloadServiceContext` + the per-dispatch `WorkloadRunnerContext`), the entry-wired dep bundles
// (`WorkloadServiceDeps` / `WorkloadRunnerDeps`), and the injected-op type aliases. Both contexts are
// EXPLICIT interfaces (never `ReturnType<>` — §7.4 / `no-context-returntype`); the doc places them in
// `context.ts`, but that file is `domain/**` outside `contract/`, where `no-inline-types` forbids an exported
// interface, so — like every sibling — the interfaces home here and `context.ts` is the BUILDER.
//
// BOUNDARIES (domain-no-cross-feature): workloads sideways-imports NO sibling runtime. Every cross-feature
// capability arrives as an injected op — the runner ops via `env` (the `WorkloadRunnerEnv` hub), plus the
// per-dispatch `bindRoleClients` binder + the `loadUserSettings` reader, ALL wired at the `entry/` root.
// `createDefaultRoleClients` is DELETED — the binder is a REQUIRED dep (invariant #7; omitting it is `tsc`-red).

import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type {
  CancelWorkloadParams,
  CancelWorkloadResult,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
  StartWorkloadParams,
} from "./params";
import type { WorkloadRunnerEnv } from "./runner-env";
import type { WorkloadRowAnyKind } from "./workload-row";

// ── injected-op type aliases (the cross-feature/determinism seams, wired at entry/) ──────────────────────

/** Mint a fresh `WorkloadId` — the injected determinism seam (no ambient `mintTypeId()` in a verb). */
export type NewWorkloadId = () => WorkloadId;

/** Bind a `RoleClients` bundle for a specific acting user. ASYNC — the per-role `{credential, model}` pins
 *  resolve off the workload's `ownerId` via `connection.resolveRole` (honoring the user's per-role
 *  `routing.roleDefaults`, with eager `*Model` provenance), so the bind itself awaits. REQUIRED — there is no
 *  `createDefaultRoleClients` fallback and no sync vLLM floor (invariant #6 / #7). */
export type BindRoleClients = (ownerId: UserId) => Promise<RoleClients>;

/** Read a user's parsed `UserSettings` (the §7.2 runner tunable-precedence source). Injected from `settings`. */
export type LoadUserSettings = (userId: UserId) => Promise<UserSettings>;

// ── the verb-facing DI bundle (start/cancel/retry/get/list close over this) ─────────────────────────────

/**
 * The bundle the `WorkloadService` verbs close over (built by `context.ts`, wired at `service.ts`). Explicit
 * interface per §7.4. `db` routes all queue access through `persistence/`; `now` is the injected clock
 * (no ambient `Date.now()`); `newWorkloadId` is the injected id minter (start/retry enqueue rows).
 */
export interface WorkloadServiceContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newWorkloadId: NewWorkloadId;
}

/** What `createWorkloadService` receives from the entry root (identical to the context — no transform). */
export type WorkloadServiceDeps = WorkloadServiceContext;

// ── the per-dispatch runner DI bundles (the engine builds the context from the deps + the row) ───────────

/**
 * The base runner deps the entry root wires + the worker holds; `runWorkload` builds a per-dispatch
 * `WorkloadRunnerContext` from these + the claimed row. `env` is the cross-feature hub; `bindRoleClients` +
 * `loadUserSettings` resolve per the row's `ownerId`; `now` is the injected clock. The lease/heartbeat
 * cadences are tunable (single-replica defaults applied in the engine) and `<= 0` disables the timers
 * (the deterministic test seam — a test drives cancel via the `AbortSignal` instead of a poll interval).
 */
export interface WorkloadRunnerDeps {
  readonly db: Db;
  readonly env: WorkloadRunnerEnv;
  readonly bindRoleClients: BindRoleClients;
  readonly loadUserSettings: LoadUserSettings;
  readonly now: () => number;
  readonly heartbeatMs?: number;
  readonly cancelPollMs?: number;
}

/**
 * The per-dispatch bundle a `Runner<K>` closes over (built by the engine for EACH claimed row). `userId` is
 * the resolved acting user (`row.ownerId` or the synthetic system id); `roleClients` is PRE-BOUND for that
 * user; `loadUserSettings` is the cached reader bound to the same user; `env` is the cross-feature hub; `now`
 * is the injected clock. A runner does pure per-kind work over these — it NEVER touches the row lifecycle.
 */
export interface WorkloadRunnerContext {
  readonly db: Db;
  readonly userId: UserId;
  readonly roleClients: RoleClients;
  readonly loadUserSettings: () => Promise<UserSettings>;
  readonly env: WorkloadRunnerEnv;
  readonly now: () => number;
}

// ── the service interface (the front door re-exports the type; the tRPC router's delegation target) ──────

/**
 * The `WorkloadService` surface (workloads.md §"Verbs"). `start` enqueues (catching the kind-active conflict
 * → `DomainConflictError`); `cancel` is race-safe + idempotent (returns the transition, aborts async);
 * `retry` clones (never mutates the audit row); `get`/`list` project typed rows. Every verb threads the
 * acting user for audit + the F3 hook, but it is NOT an authorization input yet (the procedure gate is).
 */
export interface WorkloadService {
  readonly start: (params: StartWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly cancel: (params: CancelWorkloadParams) => Promise<CancelWorkloadResult>;
  readonly retry: (params: RetryWorkloadParams) => Promise<{ id: WorkloadId }>;
  readonly get: (params: GetWorkloadParams) => Promise<WorkloadRowAnyKind>;
  readonly list: (params: ListWorkloadsParams) => Promise<readonly WorkloadRowAnyKind[]>;
}
