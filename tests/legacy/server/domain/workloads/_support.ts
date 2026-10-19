// Shared test harness for the workloads domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). The centrepiece is `fakeContributions`: the kind-keyed registry the verbs validate params against and
// the engine dispatches through, built by compose's own `buildWorkloadContributions` over a stub dep frame —
// so a domain that changes its params schema can't silently drift this harness. Run BODIES are irrelevant
// here and each domain pins its own at its mirror;
// an engine test swaps in a double via `contributionsWith`. Determinism: a fixed T0 + `castId` ids.

import type { Principal, UserRole } from "@orb/contracts/identity";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { WorkloadKind, WorkloadLane, WorkloadMode, WorkloadStatus } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { Handle, UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeFakeRoleClients } from "@orb/testkit/node/factories/role-clients.ts";
import { seedUser as seedUserRow } from "@orb/testkit/node/factories/user.ts";
import { vi } from "vitest";
import { isAdmin, isOwner, requireOwner } from "#server/domain/admin/guard.ts";
import type { WorkloadContribution, WorkloadContributions } from "#server/domain/workloads/contract/contribution.ts";
import type { WorkloadRunnerAssemblyDeps, WorkloadService } from "#server/domain/workloads/contract/service.ts";
import type { WorkloadRunnableRow } from "#server/domain/workloads/contract/workload-row.ts";
import { loadWorkload } from "#server/domain/workloads/persistence/queries.ts";
import { createWorkloadService } from "#server/domain/workloads/service.ts";
import { buildWorkloadContributions } from "#server/entry/compose/workload-contributions.ts";

type WorkloadFrame = Parameters<typeof buildWorkloadContributions>[0];

/** A fixed instant — every timestamp in a test pins to this (no ambient clock; test-determinism §3). */
export const T0 = 1_700_000_000_000;

/** The kind-keyed contribution registry a test drives the engine/verbs through — it is the params VALIDATOR
 *  the verbs + the row read path use, so every test touching a workload row needs one. Built by compose's own
 *  `buildWorkloadContributions` over a stub dep frame, so a kind compose registers is a kind this registry has. */
export function fakeContributions(opts: { readonly memoryEnabled?: boolean } = {}): WorkloadContributions {
  const stub = <T>(value: T): ReturnType<typeof vi.fn<() => Promise<T>>> => vi.fn(async () => value);
  // Only the contributions' PARAMS SCHEMAS matter here (the verbs + the row read path validate against
  // them); their run bodies are pinned at each domain's own mirror. Every dep below is a stub frame.
  return buildWorkloadContributions({
    // @orb-waive no-test-fabrication(unknown): stub frame — only the contribution's params schema is read here (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    embeddings: {
      embedCorpus: stub({ embedded: 3, skipped: 1 }),
      embedAssets: stub({ embedded: 2, skipped: 0 }),
      targetSnapshot: stub("unmoved"),
    } as unknown as WorkloadFrame["embeddings"],
    // The terminal `corpusRecomputed` fan — discarded here; its behavior is pinned at the owning domain's
    // own contribution mirror, this frame only needs the params schemas.
    emitUserEvent: () => undefined,
    listCorpusOwners: () => Promise.resolve([]),
    // @orb-waive no-test-fabrication(unknown): stub frame — only the contribution's params schema is read here (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    discovery: {
      computeThemes: stub({ digestsAssigned: 10, clustersWritten: 5 }),
      distillCharacters: stub({ scanned: 8, distilled: 8 }),
      computeCooccurrence: stub({ charKeywordsWritten: 6, pairsWritten: 4 }),
      computeDuplicatePairs: stub({ charactersScanned: 7, pairsWritten: 1 }),
      computeChatDuplicatePairs: stub({ chatsScanned: 2, pairsWritten: 0 }),
      computeCharacterHubScores: stub({ rowsScored: 7 }),
    } as unknown as WorkloadFrame["discovery"],
    loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
    // @orb-waive no-test-fabrication(Db): only the contribution's params schema is read from this Db stub frame (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    db: databaseHandle({} as Db),
    now: () => T0,
    // @orb-waive no-test-fabrication(unknown): stub frame — only the contribution's params schema is read here (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    connection: { refreshCatalog: stub({ models: [] }), refreshAgentSdkCatalog: stub({ models: [] }) } as unknown as WorkloadFrame["connection"],
    // @orb-waive no-test-fabrication(unknown): stub frame — only the contribution's params schema is read here (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    cas: {} as unknown as WorkloadFrame["cas"],
    // @orb-waive no-test-fabrication(unknown): stub frame — only the contribution's params schema is read here (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    assets: {
      backfillAvatars: stub({ scanned: 0, linked: 0 }),
      collectGarbage: stub({ scanned: 0, reclaimed: 0 }),
      fsck: stub({}),
    } as unknown as WorkloadFrame["assets"],
    backfillMemory: stub({
      segments: { scanned: 0, changed: 0 },
      segmentsSkippedOverWindow: 0,
      digests: { scanned: 0, changed: 0 },
      failed: 0,
      completedSpaces: [],
    }),
    estimateMemoryBackfill: stub(0),
    backfillGroupCharacters: stub({ scanned: 0, changed: 0 }),
    purgeMemoryVectors: stub(undefined),
    // The #156 admission precondition's read — the ONE dep here whose VALUE matters to a verb test, since
    // `memory-backfill` refuses enqueue when memory is off for the row's owner.
    isMemoryEnabled: stub(opts.memoryEnabled ?? true),
    targetSnapshot: stub("unmoved"),
    // @orb-waive no-test-fabrication(unknown): stub frame — only the contribution's params schema is read here (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    databankIngest: { ingestDocument: stub({}), reindex: stub({}) } as unknown as WorkloadFrame["databankIngest"],
    beginDocumentVectorSweep: stub([]),
    purgeDocumentVectors: stub(undefined),
    importWorkloads: {
      stagingRoot: "/tmp/orb-test-staging",
      stProfileDir: "/tmp/orb-test-profiles",
      runProfileDirImport: stub({ scanned: 0, changed: 0, failed: 0, memoryScope: null }),
      runBundleImport: stub({ imported: 0, skipped: 0, failed: 0, notes: [], memoryScope: null }),
      runStagedDirImport: stub({ imported: 0, skipped: 0, failed: 0, notes: [], memoryScope: null }),
      listTokenUsageCandidates: stub([]),
      compareAndSetTokenUsage: stub(true),
      reconcileImportStats: stub(undefined),
      refreshPlannerStats: stub(undefined),
      emitLibraryChanged: () => undefined,
    },
    refineryWorkloads: {
      roleClientsFor: () => Promise.resolve(makeFakeRoleClients()),
      resolveUtilityPresetParams: stub(undefined),
      resolveUserProse: stub({}),
      listRefineryScoreTargets: stub({ targets: [], inScope: 0 }),
      stampRefinerySignals: stub(undefined),
      emitUserEvent: () => undefined,
    },
  });
}

/** The registry with ONE kind's run body swapped for a test double. The seam an ENGINE test drives: the
 *  state machine is what's under test, so it must not ride any owning domain's real body (those are tested
 *  at their own mirrors) — and this stays correct as kinds re-home. */
export function contributionsWith<K extends WorkloadKind>(kind: K, run: WorkloadContribution<K>["run"]): WorkloadContributions {
  const base = fakeContributions();
  return { ...base, [kind]: { ...base[kind], run } };
}

/** A `WorkloadService` over a real db with the frozen clock + a deterministic sequential id minter. */
export function makeService(
  db: Db,
  contributions: WorkloadContributions = fakeContributions(),
  emitUserEvent: EmitUserEvent = () => undefined,
): WorkloadService {
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
    db: databaseHandle(db),
    getContributions: () => contributions,
    now: () => T0,
    newWorkloadId,
    newScheduleId,
    requireOwner,
    isAdmin,
    isOwner,
    emitUserEvent,
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

/** The base runner deps the engine builds a per-dispatch context from. Timers DISABLED (`*Ms: 0`) so the
 *  engine runs synchronously with no wall-clock poll (the deterministic test seam). */
export function makeRunnerDeps(db: Db, contributions: WorkloadContributions, overrides: Partial<WorkloadRunnerAssemblyDeps> = {}): WorkloadRunnerAssemblyDeps {
  return {
    db: databaseHandle(db),
    contributions,
    audit: () => Promise.resolve(),
    now: () => T0,
    heartbeatMs: 0,
    cancelPollMs: 0,
    ...overrides,
  };
}

/** Load a row for DISPATCH. The engine takes only a `WorkloadRunnableRow`, so an absent row (or a POISON one
 *  — params that don't parse) is a broken fixture here, never a case under test: it throws instead of
 *  silently narrowing away. */
export async function loadRunnableWorkload(db: Db, contributions: WorkloadContributions, id: WorkloadId): Promise<WorkloadRunnableRow> {
  const row = await loadWorkload(db, contributions, id);
  if (row === null || row.poison) {
    throw new Error(`workload ${id} is missing or poison — the fixture never produced a runnable row`);
  }
  return row;
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
    /** The single-active lock partition (`workloads.admission_key`) — the owning domain's concurrency unit.
     *  Defaults to `none` (the shared bucket a kind that declares no key carries); seed a real key to hold a
     *  distinct slot (an `index` row's embed source, a `databank-ingest` row's documentId). */
    admissionKey?: string;
    /** The EXECUTION lane (`workloads.lane`) — which worker loop would claim it. Defaults to the column
     *  default (`sweep`); pass `interactive` to seed the other lane's queue. */
    lane?: WorkloadLane;
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
    admissionKey: overrides.admissionKey ?? "none",
    lane: overrides.lane ?? "sweep",
    params: overrides.params ?? {},
    ownerId: overrides.ownerId ?? null,
    admissionSystem: (overrides.ownerId ?? null) === null,
    dependsOn: overrides.dependsOn ?? null,
    scheduledAt: overrides.scheduledAt ?? T0,
    createdAt: overrides.createdAt ?? T0,
    updatedAt: overrides.updatedAt ?? T0,
  });
  return id;
}
