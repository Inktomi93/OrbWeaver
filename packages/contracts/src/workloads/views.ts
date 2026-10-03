// @orb/contracts/workloads/views — correlated clean queue rows and the explicit corrupt-params arm.
// This output-only grammar does not select input validators or contribution dispatch.

import type { UserId, WorkloadId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { fsckReportSchema } from "../assets/index.ts";
import { backfillPassResultSchema, memoryBackfillResultSchema, memoryBackfillWorkloadParams } from "../chat/backfill.ts";
import { ingestRunResultSchema } from "../databank/index.ts";
import { analyticsResultSchema, computeThemesWorkloadParams, findDuplicatesWorkloadParams } from "../discovery/index.ts";
import { embedPassResultSchema } from "../embeddings/index.ts";
import { catalogRefreshResultSchema } from "../inference/catalog.ts";
import { refineryScoreSweepResultSchema, refineScoreSweepWorkloadParams } from "../refinery/index.ts";
import { reconcileStatsWorkloadResultSchema } from "../stats/index.ts";
import type { WorkloadKind, WorkloadMode, WorkloadStatus } from "./axes.ts";
import { scheduleCadenceSchema, workloadKindSchema, workloadModeSchema, workloadStatusSchema } from "./axes.ts";
import type { WorkloadLane, WorkloadProgress } from "./execution.ts";
import { WORKLOAD_LANES } from "./execution.ts";
import type { WorkloadParamsByKind } from "./params.ts";
import {
  databankIngestWorkloadParams,
  databankReindexWorkloadParams,
  emptyWorkloadParams,
  importBundleWorkloadParams,
  importStWorkloadParams,
  indexWorkloadParams,
  maintenanceWorkloadParams,
} from "./params.ts";
import type { WorkloadResultByKind } from "./result.ts";
import { bundleImportWorkloadResultSchema, deferredResultSchema, importTokenUsageBackfillResultSchema, maintenanceResultSchema } from "./result.ts";

interface WorkloadRowBase {
  readonly id: WorkloadId;
  readonly status: WorkloadStatus;
  readonly mode: WorkloadMode;
  /** The EXECUTION lane (which worker loop runs it), stamped at enqueue from the owning contribution. */
  readonly lane: WorkloadLane;
  /** null for a scheduler/system row; SET NULL on user delete so the never-deleted audit row outlives the user. */
  readonly ownerId: UserId | null;
  /** Enforced by the scheduler: a non-empty dependsOn dispatches only once every dep succeeded; a dep hitting
   *  a non-success terminal fails the dependent with dependency_failed instead of running. */
  readonly dependsOn: readonly WorkloadId[] | null;
  readonly error: string | null;
  /** The last DURABLE progress snapshot (the reconnect truth — no subscription needed); null until reported. */
  readonly progress: WorkloadProgress | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

type WorkloadRow<K extends WorkloadKind> = WorkloadRowBase & {
  readonly kind: K;
  readonly params: WorkloadParamsByKind[K];
  readonly result: WorkloadResultByKind[K] | null;
  readonly poison: false;
};

/** A row whose stored params no longer parse against its kind's contribution schema — readable + cancel/
 *  retry-able, never dispatchable (the params it would run on are exactly what is broken). */
interface WorkloadPoisonRow extends WorkloadRowBase {
  readonly kind: WorkloadKind;
  readonly params: null;
  readonly result: unknown;
  readonly poison: true;
}

/** A row the engine may DISPATCH: known kind, params parsed against its contribution schema. */
export type WorkloadRunnableRow = { [K in WorkloadKind]: WorkloadRow<K> }[WorkloadKind];

/** Any row a READ surface may return. A row whose kind isn't in this build narrows to nothing at all (it
 *  cannot even be spelled) and stays filtered; a known kind with unparseable params surfaces as poison. */
export type WorkloadRowAnyKind = WorkloadRunnableRow | WorkloadPoisonRow;

export const workloadProgressSchema = z
  .strictObject({ message: z.string().optional(), current: z.number().optional(), total: z.number().optional(), pct: z.number().optional() })
  .transform(({ message, current, total, pct }) => ({
    ...(message !== undefined ? { message } : {}),
    ...(current !== undefined ? { current } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(pct !== undefined ? { pct } : {}),
  })) satisfies z.ZodType<WorkloadProgress>;
const workloadRowBaseSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.workload),
  status: workloadStatusSchema,
  mode: workloadModeSchema,
  lane: z.enum(WORKLOAD_LANES),
  ownerId: brandedId<UserId>().nullable(),
  dependsOn: z.array(typeIdSchema(ID_PREFIX.workload)).readonly().nullable(),
  error: z.string().nullable(),
  progress: workloadProgressSchema.nullable(),
  scheduledAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<WorkloadRowBase>;
const workloadOutputShapes = {
  index: { params: indexWorkloadParams.strict(), result: embedPassResultSchema },
  "distill-characters": { params: emptyWorkloadParams.strict(), result: analyticsResultSchema },
  "compute-themes": { params: computeThemesWorkloadParams.strict(), result: analyticsResultSchema },
  "memory-backfill": { params: memoryBackfillWorkloadParams.strict(), result: memoryBackfillResultSchema },
  "group-character-backfill": { params: emptyWorkloadParams.strict(), result: backfillPassResultSchema },
  "compute-cooccurrence": { params: emptyWorkloadParams.strict(), result: analyticsResultSchema },
  "find-duplicates": { params: findDuplicatesWorkloadParams.strict(), result: analyticsResultSchema },
  csls: { params: emptyWorkloadParams.strict(), result: analyticsResultSchema },
  "assets-backfill": { params: maintenanceWorkloadParams.strict(), result: maintenanceResultSchema },
  "assets-gc": { params: maintenanceWorkloadParams.strict(), result: maintenanceResultSchema },
  "assets-fsck": { params: emptyWorkloadParams.strict(), result: fsckReportSchema },
  "import-st": { params: importStWorkloadParams.strict(), result: maintenanceResultSchema },
  "import-token-usage-backfill": { params: maintenanceWorkloadParams.strict(), result: importTokenUsageBackfillResultSchema },
  "import-bundle": { params: importBundleWorkloadParams.strict(), result: bundleImportWorkloadResultSchema },
  "reconcile-stats": { params: emptyWorkloadParams.strict(), result: reconcileStatsWorkloadResultSchema },
  "refresh-model-catalog": { params: emptyWorkloadParams.strict(), result: catalogRefreshResultSchema },
  "reconcile-world-state": { params: emptyWorkloadParams.strict(), result: deferredResultSchema },
  "databank-ingest": { params: databankIngestWorkloadParams.strict(), result: ingestRunResultSchema },
  "databank-reindex": {
    params: databankReindexWorkloadParams
      .strict()
      .extend({ scope: z.union(databankReindexWorkloadParams.shape.scope.options.map((option) => option.strict())) }),
    result: ingestRunResultSchema,
  },
  "refine-score-sweep": { params: refineScoreSweepWorkloadParams.strict(), result: refineryScoreSweepResultSchema },
} satisfies { [K in WorkloadKind]: { params: z.ZodType<WorkloadParamsByKind[K]>; result: z.ZodType<WorkloadResultByKind[K]> } };
export const workloadRunnableRowSchema = z.discriminatedUnion("kind", [
  workloadRowBaseSchema.extend({
    kind: z.literal("index"),
    params: workloadOutputShapes["index"].params,
    result: workloadOutputShapes["index"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("distill-characters"),
    params: workloadOutputShapes["distill-characters"].params,
    result: workloadOutputShapes["distill-characters"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("compute-themes"),
    params: workloadOutputShapes["compute-themes"].params,
    result: workloadOutputShapes["compute-themes"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("memory-backfill"),
    params: workloadOutputShapes["memory-backfill"].params,
    result: workloadOutputShapes["memory-backfill"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("group-character-backfill"),
    params: workloadOutputShapes["group-character-backfill"].params,
    result: workloadOutputShapes["group-character-backfill"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("compute-cooccurrence"),
    params: workloadOutputShapes["compute-cooccurrence"].params,
    result: workloadOutputShapes["compute-cooccurrence"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("find-duplicates"),
    params: workloadOutputShapes["find-duplicates"].params,
    result: workloadOutputShapes["find-duplicates"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("csls"),
    params: workloadOutputShapes["csls"].params,
    result: workloadOutputShapes["csls"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("assets-backfill"),
    params: workloadOutputShapes["assets-backfill"].params,
    result: workloadOutputShapes["assets-backfill"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("assets-gc"),
    params: workloadOutputShapes["assets-gc"].params,
    result: workloadOutputShapes["assets-gc"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("assets-fsck"),
    params: workloadOutputShapes["assets-fsck"].params,
    result: workloadOutputShapes["assets-fsck"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("import-st"),
    params: workloadOutputShapes["import-st"].params,
    result: workloadOutputShapes["import-st"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("import-token-usage-backfill"),
    params: workloadOutputShapes["import-token-usage-backfill"].params,
    result: workloadOutputShapes["import-token-usage-backfill"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("import-bundle"),
    params: workloadOutputShapes["import-bundle"].params,
    result: workloadOutputShapes["import-bundle"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("reconcile-stats"),
    params: workloadOutputShapes["reconcile-stats"].params,
    result: workloadOutputShapes["reconcile-stats"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("refresh-model-catalog"),
    params: workloadOutputShapes["refresh-model-catalog"].params,
    result: workloadOutputShapes["refresh-model-catalog"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("reconcile-world-state"),
    params: workloadOutputShapes["reconcile-world-state"].params,
    result: workloadOutputShapes["reconcile-world-state"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("databank-ingest"),
    params: workloadOutputShapes["databank-ingest"].params,
    result: workloadOutputShapes["databank-ingest"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("databank-reindex"),
    params: workloadOutputShapes["databank-reindex"].params,
    result: workloadOutputShapes["databank-reindex"].result.nullable(),
    poison: z.literal(false),
  }),
  workloadRowBaseSchema.extend({
    kind: z.literal("refine-score-sweep"),
    params: workloadOutputShapes["refine-score-sweep"].params,
    result: workloadOutputShapes["refine-score-sweep"].result.nullable(),
    poison: z.literal(false),
  }),
]) satisfies z.ZodType<WorkloadRunnableRow>;
/** A corrupt params blob is deliberately visible; its untyped stored result must not masquerade as clean. */
export const workloadPoisonRowSchema = workloadRowBaseSchema.extend({
  kind: workloadKindSchema,
  params: z.null(),
  result: z.unknown(),
  poison: z.literal(true),
}) satisfies z.ZodType<WorkloadPoisonRow>;
export const workloadRowAnyKindSchema = z.union([workloadRunnableRowSchema, workloadPoisonRowSchema]) satisfies z.ZodType<WorkloadRowAnyKind>;
export const workloadRefSchema = z.strictObject({ id: typeIdSchema(ID_PREFIX.workload) });
export type WorkloadRef = z.output<typeof workloadRefSchema>;
export const workloadScheduleRefSchema = z.strictObject({ id: typeIdSchema(ID_PREFIX.workloadSchedule) });
export type WorkloadScheduleRef = z.output<typeof workloadScheduleRefSchema>;
export const cancelWorkloadResultSchema = z.strictObject({ status: workloadStatusSchema.extract(["cancelling", "cancelled"]).nullable() });
export type CancelWorkloadResult = z.output<typeof cancelWorkloadResultSchema>;
/** How many Utility-model calls a run would make over its scope; `calls: null` when the kind calls no such model. */
export const modelCallEstimateSchema = z.strictObject({ calls: z.number().int().nonnegative().nullable() });
export type ModelCallEstimate = z.output<typeof modelCallEstimateSchema>;
/** Schedule params are stored objects, not clean run params; the start door validates them when fired. */
export const workloadScheduleViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.workloadSchedule),
  ownerId: brandedId<UserId>(),
  kind: workloadKindSchema,
  mode: workloadModeSchema,
  params: z.record(z.string(), z.unknown()),
  cadence: scheduleCadenceSchema,
  nextRunAt: z.number(),
  lastRunAt: z.number().nullable(),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
/** @public twin: workloadScheduleViewSchema */
export type WorkloadScheduleView = z.output<typeof workloadScheduleViewSchema>;
