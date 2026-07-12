// workloads-schedule-model — the SCHEDULES vocabulary (the TIME dimension over the workloads queue: recurring
// auto-enqueue via `workloads.createSchedule/updateSchedule/…`). Split out of workloads-model.ts to keep that
// file under the §2.1 size cap. DOM-free (node-testable). Everything derives from the D34 canonical tuples in
// `@orb/contracts/workloads`; the kind vocabulary + run-param assembly stay in workloads-model.ts (imported
// DOWN — this file depends on it, never the reverse). Backs BOTH the create and edit dialogs (one value shape).

import type { IndexSource, ScheduleCadence, WorkloadMode } from "@orb/contracts/workloads";
import { SCHEDULE_CADENCES, WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import type { WorkloadRunValues } from "./workloads-model";
import {
  isMaintenanceWorkloadKind,
  isRunnableWorkloadKind,
  RUNNABLE_WORKLOAD_KINDS,
} from "./workloads-model";

/** Whether a kind may be scheduled to recur in BULK (owner-only, all-owners sweep). A schedule carries
 *  NO `targetOwnerId` (createSchedule/updateSchedule take none), so a bulk CREATE-kind (`bulkRequiresTarget`,
 *  e.g. import-st) is NOT bulk-schedulable — its bulk mode needs a mint target the schedule can't supply.
 *  So the schedule Bulk toggle appears only for a singular-capable, bulk-capable, non-create kind (the
 *  sweep kinds). Maintenance kinds (bulk-only built) are handled separately — bulk BY FORCE, not a toggle. */
export function workloadKindBulkSchedulable(kind: string): boolean {
  return (
    isRunnableWorkloadKind(kind) &&
    WORKLOAD_KIND_MODES[kind].bulk &&
    !WORKLOAD_KIND_MODES[kind].bulkRequiresTarget
  );
}

/** Resolve the wire `mode` for a schedule create/edit from the picked kind + the owner's Bulk toggle.
 *  Mirrors the run dialog's mode logic: a maintenance (built bulk-only) kind is bulk BY FORCE; a
 *  bulk-schedulable sweep kind rides the owner's toggle; everything else is singular. A non-owner never
 *  reaches a bulk mode (the toggle never renders, and the server re-gates bulk on `requireOwner`). */
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

/** Cadence → human label (exhaustive over the D34 `SCHEDULE_CADENCES` tuple — a new cadence fails `tsc`
 *  here until it gets a label). */
export const SCHEDULE_CADENCE_LABELS: Record<ScheduleCadence, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

/** The cadence picker items (in the contract's tuple order). */
export const SCHEDULE_CADENCE_ITEMS: readonly { value: string; label: string }[] =
  SCHEDULE_CADENCES.map((cadence) => ({ value: cadence, label: SCHEDULE_CADENCE_LABELS[cadence] }));

/** The schedule form values (§13.4 — a ≥3-field form rides `createSavedEntityForm`). Backs BOTH the
 *  create and the edit dialogs (identical shape → one form factory, two dialogs). The param slots mirror
 *  the run form so `buildStartInput` assembles the same wire input a manual run would. `kind` is a
 *  plain string; the actual save narrows. `bulk` is the OWNER-only recurring-sweep toggle (a non-owner's
 *  dialog never renders it, so it stays `false`); {@link resolveScheduleMode} maps it to the wire `mode`. */
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

/** Extract the run-param slots from a schedule row's stored `params` blob (the raw `ParamsByKind` the tick
 *  feeds `start`) — the inverse of `buildStartInput`, seeding the edit dialog's controls. Tolerant of
 *  any kind's blob: an absent/foreign key falls back to the form default (only the active kind's controls
 *  read the slot, so an inert value is harmless). */
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

/** Seed the edit dialog's form from an existing schedule row (kind + cadence + bulk + the param slots).
 *  Structural on purpose (kind/cadence/mode/params) so it stays DOM-free + node-testable without the wire type. */
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
