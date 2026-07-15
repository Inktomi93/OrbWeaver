// workloads-schedule-model — the schedules vocabulary: the time dimension over the workloads queue
// (recurring auto-enqueue via workloads.createSchedule/updateSchedule). DOM-free. Backs both the create
// and edit dialogs (one value shape).

import type { IndexSource, ScheduleCadence, WorkloadMode } from "@orb/contracts/workloads";
import { SCHEDULE_CADENCES, WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import type { WorkloadRunValues } from "./workloads-model";
import {
  isMaintenanceWorkloadKind,
  isRunnableWorkloadKind,
  RUNNABLE_WORKLOAD_KINDS,
} from "./workloads-model";

/** Whether a kind may be scheduled to recur in bulk. A schedule carries no `targetOwnerId`, so a bulk create-kind (bulkRequiresTarget) is not bulk-schedulable. */
export function workloadKindBulkSchedulable(kind: string): boolean {
  return (
    isRunnableWorkloadKind(kind) &&
    WORKLOAD_KIND_MODES[kind].bulk &&
    !WORKLOAD_KIND_MODES[kind].bulkRequiresTarget
  );
}

/** Resolve the wire `mode` for a schedule create/edit — mirrors the run dialog's mode logic. */
export function resolveScheduleMode(
  kind: string,
  bulk: boolean,
  viewerIsOwner: boolean,
): WorkloadMode {
  if (isMaintenanceWorkloadKind(kind)) {
    return "bulk";
  }
  if (viewerIsOwner && bulk && workloadKindBulkSchedulable(kind)) {
    return "bulk";
  }
  return "singular";
}

/** Cadence → human label (exhaustive — a new cadence fails `tsc` until it gets a label). */
export const SCHEDULE_CADENCE_LABELS: Record<ScheduleCadence, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

/** The cadence picker items (in the contract's tuple order). */
export const SCHEDULE_CADENCE_ITEMS: readonly { value: string; label: string }[] =
  SCHEDULE_CADENCES.map((cadence) => ({ value: cadence, label: SCHEDULE_CADENCE_LABELS[cadence] }));

/** The schedule form values. Backs both the create and edit dialogs; the param slots mirror the run form
 *  so `buildStartInput` assembles the same wire input a manual run would. */
export interface CreateScheduleFormValues {
  readonly kind: string;
  readonly cadence: ScheduleCadence;
  /** Owner-only bulk (all-owners recurring sweep) toggle — a non-owner's dialog never renders the field. */
  readonly bulk: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly k: number | null;
  readonly source: IndexSource;
}

export const CREATE_SCHEDULE_FORM_DEFAULTS: CreateScheduleFormValues = {
  kind: RUNNABLE_WORKLOAD_KINDS[0] ?? "index",
  cadence: "daily",
  bulk: false,
  force: false,
  dryRun: false,
  k: null,
  source: "all",
};

/** Extract the run-param slots from a schedule row's stored `params` blob — the inverse of `buildStartInput`, seeding the edit dialog's controls. */
export function scheduleParamsToRunValues(params: Record<string, unknown>): WorkloadRunValues {
  const source = params["source"];
  const k = params["k"];
  return {
    force: params["force"] === true,
    dryRun: params["dryRun"] === true,
    k: typeof k === "number" ? k : null,
    source: source === "text" || source === "image" || source === "all" ? source : "all",
  };
}

/** Seed the edit dialog's form from an existing schedule row. Structural on purpose so it stays DOM-free without the wire type. */
export function scheduleFormValuesFromRow(row: {
  readonly kind: string;
  readonly cadence: ScheduleCadence;
  readonly mode: WorkloadMode;
  readonly params: Record<string, unknown>;
}): CreateScheduleFormValues {
  return {
    kind: row.kind,
    cadence: row.cadence,
    bulk: row.mode === "bulk",
    ...scheduleParamsToRunValues(row.params),
  };
}
