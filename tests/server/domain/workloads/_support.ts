// Shared test harness for the workloads domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds the deterministic runner context/deps with FAKE injected ops (the "fake at the edges, inject at
// the root" doctrine, testing §3): the cross-feature env is a bundle of `vi.fn`s with sane default returns,
// so a runner test asserts the runner's translation/projection + that it called the right op, and an engine
// test drives a real claimed row through `runWorkload` over a real `:memory:` db. Determinism: a fixed T0
// (no ambient clock) + `castId` ids (no unseeded mint).

import type { ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { RoleClients } from "@orb/contracts/role-clients";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { WorkloadKind, WorkloadMode, WorkloadSource, WorkloadStatus } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import type { DocumentId, Handle, UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import { isAdmin, requireOwner } from "../../../../packages/server/src/domain/admin/guard.ts";
import { createConnectionWorkloadContributions } from "../../../../packages/server/src/domain/connection/workload-contributions.ts";
import { createDiscoveryWorkloadContributions } from "../../../../packages/server/src/domain/discovery/workload-contributions.ts";
import { createEmbeddingsWorkloadContributions } from "../../../../packages/server/src/domain/embeddings/workload-contributions.ts";
import { createStatsWorkloadContributions } from "../../../../packages/server/src/domain/stats/workload-contributions.ts";
import type {
  AnyWorkloadContribution,
  WorkloadContribution,
  WorkloadContributions,
} from "../../../../packages/server/src/domain/workloads/contract/contribution.ts";
import type { WorkloadRunnerEnv } from "../../../../packages/server/src/domain/workloads/contract/runner-env.ts";
import type { WorkloadRunnerContext, WorkloadRunnerDeps, WorkloadService } from "../../../../packages/server/src/domain/workloads/contract/service.ts";
import { createWorkloadService } from "../../../../packages/server/src/domain/workloads/service.ts";
import { buildShimContributions } from "../../../../packages/server/src/domain/workloads/substrate/shim-contributions.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

/** A fixed instant — every timestamp in a test pins to this (no ambient clock; test-determinism §3). */
export const T0 = 1_700_000_000_000;

/** The default enumeration owner a runner context carries (the SINGULAR scope a runner threads to its op). */
export const RUNNER_OWNER_ID = castId<UserId>("user_owner");

/** The kind-keyed contribution registry a test drives the engine/verbs through — it is the params VALIDATOR
 *  the verbs + the row read path use, so every test touching a workload row needs one. Assembled exactly the
 *  way `entry/compose` does it (the owning domains' real factories over stub deps, plus the shrinking shim
 *  for the not-yet-moved kinds), so a stage that re-homes a kind can't silently drift this harness. */
export function fakeContributions(env: WorkloadRunnerEnv = fakeEnv()): WorkloadContributions {
  const stub = <T>(value: T): ReturnType<typeof vi.fn<() => Promise<T>>> => vi.fn(async () => value);
  // This harness needs the owning domains' real PARAMS SCHEMAS (the verbs + the row read path validate
  // against them), not their run bodies — those are tested at each domain's own mirror. Stating a full
  // service per domain here would be noise, so every dep below is a deliberate stub frame.
  const contributions: readonly AnyWorkloadContribution[] = [
    // FABRICATION-OK: stub frame — only the contribution's params schema is read here (see above).
    ...createEmbeddingsWorkloadContributions({
      embeddings: { embedCorpus: stub({ embedded: 3, skipped: 1 }), embedAssets: stub({ embedded: 2, skipped: 0 }) } as never,
    }),
    // FABRICATION-OK: stub frame — only the contribution's params schema is read here (see above).
    ...createDiscoveryWorkloadContributions({
      discovery: {
        computeThemes: stub({ digestsAssigned: 10, clustersWritten: 5 }),
        distillCharacters: stub({ scanned: 8, distilled: 8 }),
        computeCooccurrence: stub({ charKeywordsWritten: 6, pairsWritten: 4 }),
        computeDuplicatePairs: stub({ charactersScanned: 7, pairsWritten: 1 }),
        computeChatDuplicatePairs: stub({ chatsScanned: 2, pairsWritten: 0 }),
        computeCharacterHubScores: stub({ rowsScored: 7 }),
      } as never,
      loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
    }),
    // FABRICATION-OK: stub frame — only the contribution's params schema is read here (see above).
    ...createStatsWorkloadContributions({ db: {} as Db, now: () => T0 }),
    // FABRICATION-OK: stub frame — only the contribution's params schema is read here (see above).
    ...createConnectionWorkloadContributions({
      connection: { refreshCatalog: stub({ models: [] }), refreshAgentSdkCatalog: stub({ models: [] }) } as never,
    }),
    ...buildShimContributions({
      env,
      // FABRICATION-OK: no shimmed runner reads roleClients (measured consumer count: zero).
      bindRoleClients: () => Promise.resolve({} as RoleClients),
      loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
      now: () => T0,
    }),
  ];
  return Object.fromEntries(contributions.map((contribution) => [contribution.kind, contribution])) as WorkloadContributions;
}

/** The registry with ONE kind's run body swapped for a test double. The seam an ENGINE test drives: the
 *  state machine is what's under test, so it must not ride any owning domain's real body (those are tested
 *  at their own mirrors) — and this stays correct as kinds re-home. */
export function contributionsWith<K extends WorkloadKind>(kind: K, run: WorkloadContribution<K>["run"]): WorkloadContributions {
  const base = fakeContributions();
  return { ...base, [kind]: { ...base[kind], run } };
}

/** A `WorkloadService` over a real db with the frozen clock + a deterministic sequential id minter. */
export function makeService(db: Db, contributions: WorkloadContributions = fakeContributions()): WorkloadService {
  let n = 0;
  const newWorkloadId = (): WorkloadId => {
    n += 1;
    return castId<WorkloadId>(`workload_${n}`);
  };
  let sn = 0;
  const newScheduleId = (): WorkloadScheduleId => {
    sn += 1;
    return castId<WorkloadScheduleId>(`workload_schedule_${sn}`);
  };
  return createWorkloadService({
    db,
    getContributions: () => contributions,
    now: () => T0,
    newWorkloadId,
    newScheduleId,
    requireOwner,
    isAdmin,
  });
}

/** Insert a `users` row (the FK parent for an owner-scoped workload). Thin delegate over the canonical
 *  factory — workloads' call sites pass a bare-string `id` and want the id back, not the row. Defaults to
 *  role `user` (NOT `owner`) so a test can seed several rows without tripping the single-owner unique index. */
export async function seedUser(db: Db, id = "user_owner", role: UserRole = "user"): Promise<UserId> {
  const uid = castId<UserId>(id);
  const seeded = await seedUserRow(db, { id: uid, handle: castId<Handle>(id), role });
  return seeded.id;
}

/** A test `Principal` — the F3 authz subject the verbs gate on. `role` picks the global-role axis
 *  (`user` = a plain caller scoped to its own workloads; `admin`/`owner` = the deployment-wide apex). */
export function principal(id: string, role: UserRole = "user"): Principal {
  return {
    userId: castId<UserId>(id),
    role,
    handle: castId<Handle>(id),
    externalId: null,
    via: "header",
  };
}

/** A fake cross-feature env: every op is a `vi.fn` with a sane default return; a test overrides a single op
 *  to assert behavior (failure/cancel) or read `.mock.calls`. `cas` is unused by any runner (cast).
 *  `overrides` is a deep partial-per-feature bundle, applied at construction — `WorkloadRunnerEnv`'s
 *  feature ops are readonly, so a test can no longer reassign `env.<feature>.<op>` after the fact. */
export function fakeEnv(overrides: { [K in keyof WorkloadRunnerEnv]?: Partial<WorkloadRunnerEnv[K]> } = {}): WorkloadRunnerEnv {
  return {
    embeddings: {
      purgeDocumentVectors: vi.fn(async () => undefined),
      ...overrides.embeddings,
    },
    databank: {
      ingest: vi.fn(async (_args: { documentId: DocumentId; signal: AbortSignal }) => ({
        documents: 1,
        chunksUpserted: 3,
        chunksNoop: 0,
        chunksPruned: 0,
        reExtracted: 0,
        failed: [],
      })),
      reindex: vi.fn(async (_args: { ownerId: UserId | null; scope: ReindexScope; mode: ReindexMode; signal: AbortSignal }) => ({
        documents: 2,
        chunksUpserted: 5,
        chunksNoop: 1,
        chunksPruned: 2,
        reExtracted: 0,
        failed: [],
      })),
      ...overrides.databank,
    },
    import: {
      importAll: vi.fn(async (_args: { ownerId: UserId; dryRun: boolean; signal: AbortSignal }) => ({
        scanned: 12,
        changed: 4,
      })),
      importBundle: vi.fn(async (_args: { ownerId: UserId; token: string; signal: AbortSignal }) => ({
        imported: 7,
        skipped: 1,
        failed: 0,
      })),
    },
    stats: {
      reconcileStats: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        owners: 1,
        characters: 4,
      })),
    },
  };
}

/** A per-dispatch runner context over a fake env (the runner under test reads `ctx.env.<feature>.<op>`). */
export function makeRunnerContext(env: WorkloadRunnerEnv, overrides: Partial<WorkloadRunnerContext> = {}): WorkloadRunnerContext {
  return {
    userId: RUNNER_OWNER_ID,
    // The enumeration scope a runner threads to its op (SINGULAR by default; a bulk test overrides to null).
    ownerId: RUNNER_OWNER_ID,
    // FABRICATION-OK: no surviving runner reads roleClients (measured consumer count: zero).
    roleClients: {} as RoleClients,
    loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
    env,
    now: () => T0,
    ...overrides,
  };
}

/** The base runner deps the engine builds a per-dispatch context from. Timers DISABLED (`*Ms: 0`) so the
 *  engine runs synchronously with no wall-clock poll (the deterministic test seam). */
export function makeRunnerDeps(db: Db, contributions: WorkloadContributions, overrides: Partial<WorkloadRunnerDeps> = {}): WorkloadRunnerDeps {
  return {
    db,
    contributions,
    audit: () => Promise.resolve(),
    now: () => T0,
    heartbeatMs: 0,
    cancelPollMs: 0,
    ...overrides,
  };
}

/** Directly insert a workload row (engine/persistence tests need arbitrary start states the verbs can't make
 *  — e.g. a pre-seeded `running`/`failed`/stale row). `status` defaults to `queued`. */
export async function seedWorkloadRow(
  db: Db,
  overrides: {
    id?: string;
    kind?: WorkloadKind;
    status?: WorkloadStatus;
    mode?: WorkloadMode;
    /** The single-active lock partition (`workloads.source`). Defaults to `none` (the non-index sentinel);
     *  seed a real `text`/`image`/`all` for an `index`-kind row. */
    source?: WorkloadSource;
    ownerId?: UserId | null;
    params?: Record<string, unknown>;
    dependsOn?: readonly WorkloadId[] | null;
    updatedAt?: number;
    scheduledAt?: number;
    createdAt?: number;
  } = {},
): Promise<WorkloadId> {
  const id = castId<WorkloadId>(overrides.id ?? "workload_seed");
  await db.insert(workloads).values({
    id,
    kind: overrides.kind ?? "reconcile-stats",
    status: overrides.status ?? "queued",
    mode: overrides.mode ?? "singular",
    source: overrides.source ?? "none",
    params: overrides.params ?? {},
    ownerId: overrides.ownerId ?? null,
    dependsOn: overrides.dependsOn ?? null,
    scheduledAt: overrides.scheduledAt ?? T0,
    createdAt: overrides.createdAt ?? T0,
    updatedAt: overrides.updatedAt ?? T0,
  });
  return id;
}
