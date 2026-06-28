// Shared test harness for the workloads domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds the deterministic runner context/deps with FAKE injected ops (the "fake at the edges, inject at
// the root" doctrine, testing §3): the cross-feature env is a bundle of `vi.fn`s with sane default returns,
// so a runner test asserts the runner's translation/projection + that it called the right op, and an engine
// test drives a real claimed row through `runWorkload` over a real `:memory:` db. Determinism: a fixed T0
// (no ambient clock) + `castId` ids (no unseeded mint).

import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { users, workloads } from "@orb/db";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import type { WorkloadRunnerEnv } from "../../../../packages/server/src/domain/workloads/contract/runner-env.ts";
import type {
  WorkloadRunnerContext,
  WorkloadRunnerDeps,
  WorkloadService,
} from "../../../../packages/server/src/domain/workloads/contract/service.ts";
import { createWorkloadService } from "../../../../packages/server/src/domain/workloads/service.ts";
import type { Cas } from "../../../../packages/server/src/infra/storage/index.ts";

/** A fixed instant — every timestamp in a test pins to this (no ambient clock; test-determinism §3). */
export const T0 = 1_700_000_000_000;

/** A `WorkloadService` over a real db with the frozen clock + a deterministic sequential id minter. */
export function makeService(db: Db): WorkloadService {
  let n = 0;
  const newWorkloadId = (): WorkloadId => {
    n += 1;
    return castId<WorkloadId>(`workload_${n}`);
  };
  return createWorkloadService({ db, now: () => T0, newWorkloadId });
}

/** Insert a `users` row (the FK parent for an owner-scoped workload). */
export async function seedUser(db: Db, id = "user_owner"): Promise<UserId> {
  const uid = castId<UserId>(id);
  await db.insert(users).values({ id: uid, handle: castId<Handle>(id), role: "owner" });
  return uid;
}

/** A fake cross-feature env: every op is a `vi.fn` with a sane default return; a test overrides a single op
 *  to assert behavior (failure/cancel) or read `.mock.calls`. `cas` is unused by any runner (cast). */
export function fakeEnv(): WorkloadRunnerEnv {
  return {
    embeddings: {
      embedCorpus: vi.fn(async (_args: { force: boolean; signal: AbortSignal }) => ({
        embedded: 3,
        skipped: 1,
      })),
      embedAssets: vi.fn(async (_args: { force: boolean; signal: AbortSignal }) => ({
        embedded: 2,
        skipped: 0,
      })),
    },
    discovery: {
      computeThemes: vi.fn(async (_args: { k: number; signal: AbortSignal }) => ({
        scanned: 10,
        written: 5,
      })),
      distillCharacters: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 8,
        written: 8,
      })),
      computeCooccurrence: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 6,
        written: 4,
      })),
      findDuplicates: vi.fn(async (_args: { signal: AbortSignal }) => ({ scanned: 9, written: 1 })),
      computeHubScores: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 7,
        written: 7,
      })),
    },
    import: {
      importAll: vi.fn(async (_args: { dryRun: boolean; signal: AbortSignal }) => ({
        scanned: 12,
        changed: 4,
      })),
    },
    assets: {
      backfillAvatars: vi.fn(async (_args: { dryRun: boolean; signal: AbortSignal }) => ({
        scanned: 20,
        changed: 3,
      })),
      collectGarbage: vi.fn(async (_args: { dryRun: boolean; signal: AbortSignal }) => ({
        scanned: 0,
        changed: 0,
      })),
      fsck: vi.fn(async (_args: { signal: AbortSignal }) => ({ scanned: 0, changed: 0 })),
    },
    stats: {
      reconcileStats: vi.fn(async (_args: { signal: AbortSignal }) => ({
        owners: 1,
        characters: 4,
      })),
    },
    connection: {
      refreshCatalogSnapshot: vi.fn(async (_args: { signal: AbortSignal }) => ({ models: 99 })),
    },
    memory: {
      generateDigests: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 0,
        changed: 0,
      })),
      generateSegments: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 0,
        changed: 0,
      })),
    },
    character: {
      mintSyntheticGroupCharacter: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 0,
        changed: 0,
      })),
    },
    cas: {} as Cas,
  };
}

/** A per-dispatch runner context over a fake env (the runner under test reads `ctx.env.<feature>.<op>`). */
export function makeRunnerContext(
  env: WorkloadRunnerEnv,
  overrides: Partial<WorkloadRunnerContext> = {},
): WorkloadRunnerContext {
  return {
    db: {} as Db,
    userId: castId<UserId>("user_owner"),
    roleClients: {} as RoleClients,
    loadUserSettings: () => Promise.resolve({} as UserSettings),
    env,
    now: () => T0,
    ...overrides,
  };
}

/** The base runner deps the engine builds a per-dispatch context from. Timers DISABLED (`*Ms: 0`) so the
 *  engine runs synchronously with no wall-clock poll (the deterministic test seam). */
export function makeRunnerDeps(
  db: Db,
  env: WorkloadRunnerEnv,
  overrides: Partial<WorkloadRunnerDeps> = {},
): WorkloadRunnerDeps {
  return {
    db,
    env,
    bindRoleClients: () => ({}) as RoleClients,
    loadUserSettings: () => Promise.resolve({} as UserSettings),
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
    ownerId?: UserId | null;
    params?: Record<string, unknown>;
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
    params: overrides.params ?? {},
    ownerId: overrides.ownerId ?? null,
    scheduledAt: overrides.scheduledAt ?? T0,
    createdAt: overrides.createdAt ?? T0,
    updatedAt: overrides.updatedAt ?? T0,
  });
  return id;
}
