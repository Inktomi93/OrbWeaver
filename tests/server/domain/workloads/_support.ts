// Shared test harness for the workloads domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds the deterministic runner context/deps with FAKE injected ops (the "fake at the edges, inject at
// the root" doctrine, testing §3): the cross-feature env is a bundle of `vi.fn`s with sane default returns,
// so a runner test asserts the runner's translation/projection + that it called the right op, and an engine
// test drives a real claimed row through `runWorkload` over a real `:memory:` db. Determinism: a fixed T0
// (no ambient clock) + `castId` ids (no unseeded mint).

import type { CardEvolutionApplyArgs, DirectorApplyArgs, KeeperApplyArgs, ProseAuditApplyArgs } from "@orb/contracts/crew";
import type { ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { RoleClients } from "@orb/contracts/role-clients";
import type {
  RpgDirectorApplyArgs,
  RpgLorebookUpkeepApplyArgs,
  RpgRecapApplyArgs,
  RpgRecruitCardApplyArgs,
  RpgSceneDistillApplyArgs,
  RpgSessionDistillApplyArgs,
  RpgWorldGenApplyArgs,
} from "@orb/contracts/rpg";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { WorkloadKind, WorkloadMode, WorkloadSource, WorkloadStatus } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import type { AssetId, ChatId, DocumentId, Handle, MessageVariantId, UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { vi } from "vitest";
import { isAdmin, requireOwner } from "../../../../packages/server/src/domain/admin/guard.ts";
import type { CrewAgentRequest, WorkloadRunnerEnv } from "../../../../packages/server/src/domain/workloads/contract/runner-env.ts";
import type { WorkloadRunnerContext, WorkloadRunnerDeps, WorkloadService } from "../../../../packages/server/src/domain/workloads/contract/service.ts";
import { createWorkloadService } from "../../../../packages/server/src/domain/workloads/service.ts";
import type { Cas } from "../../../../packages/server/src/infra/storage/index.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

/** A fixed instant — every timestamp in a test pins to this (no ambient clock; test-determinism §3). */
export const T0 = 1_700_000_000_000;

/** The default enumeration owner a runner context carries (the SINGULAR scope a runner threads to its op). */
export const RUNNER_OWNER_ID = castId<UserId>("user_owner");

/** A `WorkloadService` over a real db with the frozen clock + a deterministic sequential id minter. */
export function makeService(db: Db): WorkloadService {
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
      embedCorpus: vi.fn(async (_args: { ownerId: UserId | null; force: boolean; signal: AbortSignal }) => ({
        embedded: 3,
        skipped: 1,
      })),
      embedAssets: vi.fn(async (_args: { ownerId: UserId | null; force: boolean; signal: AbortSignal }) => ({
        embedded: 2,
        skipped: 0,
      })),
      purgeMemoryVectors: vi.fn(async () => undefined),
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
    discovery: {
      computeThemes: vi.fn(async (_args: { ownerId: UserId | null; k: number; signal: AbortSignal }) => ({
        scanned: 10,
        written: 5,
      })),
      distillCharacters: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        scanned: 8,
        written: 8,
      })),
      computeCooccurrence: vi.fn(async (_args: { signal: AbortSignal }) => ({
        scanned: 6,
        written: 4,
      })),
      findDuplicates: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        scanned: 9,
        written: 1,
      })),
      computeHubScores: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        scanned: 7,
        written: 7,
      })),
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
    assets: {
      backfillAvatars: vi.fn(async (_args: { ownerId: UserId | null; dryRun: boolean; signal: AbortSignal }) => ({
        scanned: 20,
        changed: 3,
      })),
      collectGarbage: vi.fn(async (_args: { dryRun: boolean; signal: AbortSignal }) => ({
        scanned: 10,
        changed: 4,
      })),
      fsck: vi.fn(async (_args: { signal: AbortSignal }) => ({
        danglingRows: 1,
        corruptBlobs: 0,
        orphanBlobs: 2,
      })),
    },
    stats: {
      reconcileStats: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        owners: 1,
        characters: 4,
      })),
    },
    connection: {
      refreshCatalogSnapshot: vi.fn(async (_args: { signal: AbortSignal }) => ({
        models: 99,
        agentSdkModels: 3,
      })),
      ...overrides.connection,
    },
    memory: {
      backfill: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        segments: { scanned: 4, changed: 2 },
        digests: { scanned: 6, changed: 3 },
        failed: 0,
      })),
    },
    character: {
      backfillGroupCharacters: vi.fn(async (_args: { ownerId: UserId | null; signal: AbortSignal }) => ({
        scanned: 5,
        changed: 1,
      })),
      ...overrides.character,
    },
    chatCrew: {
      readKeeperInputs: vi.fn(async (_chatId: ChatId) => null),
      applyKeeperResult: vi.fn(async (_args: KeeperApplyArgs) => ({ entriesAdded: 0, entriesReplaced: 0, skippedHandEdited: 0, spanTo: 0 })),
      readDirectorInputs: vi.fn(async (_chatId: ChatId) => null),
      applyDirectorPass: vi.fn(async (_args: DirectorApplyArgs) => ({ arcStatus: "active" as const, twistsAdded: 0, twistsRetired: 0, guidanceChars: 0 })),
      readCardEvolutionInputs: vi.fn(async (_chatId: ChatId) => null),
      applyCardEvolution: vi.fn(async (_args: CardEvolutionApplyArgs) => ({ proposalsFiled: 0, charactersAudited: 0, spanTo: 0 })),
      readProseAuditInputs: vi.fn(async (_chatId: ChatId, _variantId: MessageVariantId) => null),
      applyProseAudit: vi.fn(async (_args: ProseAuditApplyArgs) => ({ verdict: "clean" as const, proposalId: null })),
      agentTurn: vi.fn(async (_req: CrewAgentRequest) => ({ text: "{}" })),
      ...overrides.chatCrew,
    },
    // The R6 rpg crew seam (06 §3) — readers null (no-op) + appliers zero-effect by default; a runner test
    // overrides to assert the reader→agentTurn→applier flow. agentTurn shares the crew's `{}` default.
    rpg: {
      readWorldGenInputs: vi.fn(async () => null),
      applyWorldGen: vi.fn(async (_args: RpgWorldGenApplyArgs) => ({ regions: 0, npcs: 0, clocks: 0, widgets: 0, sheets: 0 })),
      readRecapInputs: vi.fn(async () => null),
      applyRecap: vi.fn(async (_args: RpgRecapApplyArgs) => ({ posted: false })),
      readSessionDistillInputs: vi.fn(async () => null),
      applySessionDistill: vi.fn(async (_args: RpgSessionDistillApplyArgs) => ({
        summaryWritten: false,
        progressionApplied: false,
        sheetProposals: [],
        moraleAdjust: null,
      })),
      readDirectorInputs: vi.fn(async () => null),
      applyDirectorPass: vi.fn(async (_args: RpgDirectorApplyArgs) => ({
        arcStatus: "active" as const,
        twistsAdded: 0,
        twistsRetired: 0,
        clocksTicked: 0,
        hiddenClockAdded: false,
      })),
      readLorebookUpkeepInputs: vi.fn(async () => null),
      applyLorebookUpkeep: vi.fn(async (_args: RpgLorebookUpkeepApplyArgs) => ({ entriesAdded: 0, entriesReplaced: 0, skippedHandEdited: 0 })),
      // The R10 scene/recruit crew seam (07 §2–§3) — readers null (no-op) + appliers zero-effect by default; a
      // runner test overrides to assert the reader→agentTurn→applier flow. Scene-plan is read-only (no applier).
      readScenePlanInputs: vi.fn(async () => null),
      readSceneDistillInputs: vi.fn(async () => null),
      applySceneDistill: vi.fn(async (_args: RpgSceneDistillApplyArgs) => ({ concluded: false })),
      readRecruitCardInputs: vi.fn(async () => null),
      applyRecruitCard: vi.fn(async (_args: RpgRecruitCardApplyArgs) => ({ recruited: false, characterId: null, partyMemberId: null })),
      agentTurn: vi.fn(async (_req: CrewAgentRequest) => ({ text: "{}" })),
      // The R9 image-workload passes — benign no-generate defaults; a runner test overrides to assert delegation.
      runNpcPortrait: vi.fn(async () => ({ assetId: null, reused: false, refusedNoCapability: true, preview: null })),
      runIllustration: vi.fn(async () => ({ messageId: null, posted: false, skippedCadence: false, refusedNoCapability: true, preview: null })),
      ...overrides.rpg,
    },
    // The E4 expressions-sprite-sheet pass seam — a working default (zero-written result) every runner test
    // shares; the runner test overrides it to assert delegation (expressions-design/03 §3.3).
    expressions: {
      runSpriteSheetJob: vi.fn(async () => ({ written: 0, labels: [], sheetAssetId: castId<AssetId>("asset_sheet"), model: "test-model", costUsd: null })),
      ...overrides.expressions,
    },
    cas: {} as Cas,
  };
}

/** A per-dispatch runner context over a fake env (the runner under test reads `ctx.env.<feature>.<op>`). */
export function makeRunnerContext(env: WorkloadRunnerEnv, overrides: Partial<WorkloadRunnerContext> = {}): WorkloadRunnerContext {
  return {
    userId: RUNNER_OWNER_ID,
    // The enumeration scope a runner threads to its op (SINGULAR by default; a bulk test overrides to null).
    ownerId: RUNNER_OWNER_ID,
    roleClients: {} as RoleClients,
    loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
    env,
    now: () => T0,
    ...overrides,
  };
}

/** The base runner deps the engine builds a per-dispatch context from. Timers DISABLED (`*Ms: 0`) so the
 *  engine runs synchronously with no wall-clock poll (the deterministic test seam). */
export function makeRunnerDeps(db: Db, env: WorkloadRunnerEnv, overrides: Partial<WorkloadRunnerDeps> = {}): WorkloadRunnerDeps {
  return {
    db,
    env,
    bindRoleClients: () => Promise.resolve({} as RoleClients),
    loadUserSettings: () => Promise.resolve(DEFAULT_USER_SETTINGS),
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
