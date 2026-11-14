// workloads-schedule-model — the schedules vocabulary: the time dimension over the workloads queue
// (recurring auto-enqueue via workloads.createSchedule/updateSchedule). DOM-free. Backs both the create
// and edit dialogs (one value shape).

import { ASSET_KINDS } from "@orb/contracts/assets";
import type { ScheduleCadence, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import { SCHEDULE_CADENCES, WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { ITEM_ENABLED_SETTING, itemSwitchName } from "#lib";
import type { WorkloadRunValues } from "./workloads-model.ts";
import { isMaintenanceWorkloadKind, isRunnableWorkloadKind, RUNNABLE_WORKLOAD_KINDS, WORKLOAD_KIND_LABELS } from "./workloads-model.ts";
import { WORKLOAD_BULK_BADGE } from "./workloads-names.ts";

/** Whether a kind may be scheduled to recur in bulk. A schedule carries no `targetOwnerId`, so a bulk create-kind (bulkRequiresTarget) is not bulk-schedulable. */
export function workloadKindBulkSchedulable(kind: string): boolean {
  return isRunnableWorkloadKind(kind) && !WORKLOAD_KIND_MODES[kind].bulkRequiresTarget;
}

/** Resolve the wire `mode` for a schedule create/edit — mirrors the run dialog's mode logic. */
export function resolveScheduleMode(kind: string, bulk: boolean, viewerIsOwner: boolean): WorkloadMode {
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

/** What a disabled schedule's row says where its next run would read. */
export const SCHEDULE_PAUSED_LABEL = "Paused";

/** What names one schedule row: its kind, cadence and mode, plus the owner's handle on a row that is not the viewer's. */
export interface ScheduleIdentity {
  readonly kind: WorkloadKind;
  readonly cadence: ScheduleCadence;
  readonly ownerHandle: string | null;
  readonly mode: WorkloadMode;
}

/**
 * The one name of a schedule row, read by its switch, Edit and Delete and its delete confirmation. A kind can recur at several
 * cadences, an admin sees other users' rows, and the box owner can keep a singular and a bulk schedule of one kind and cadence,
 * so kind alone names rows alike. The row's title shows the same words up to the mode, which its Bulk badge carries.
 */
export function scheduleName(identity: ScheduleIdentity): string {
  const name = `${WORKLOAD_KIND_LABELS[identity.kind]} · ${scheduleQualifier(identity)}`;
  return identity.mode === "bulk" ? `${name} · ${WORKLOAD_BULK_BADGE}` : name;
}

/** The half of a schedule's name that tells two schedules of one kind apart: its cadence and, on another user's row, its owner. */
export function scheduleQualifier({ cadence, ownerHandle }: Pick<ScheduleIdentity, "cadence" | "ownerHandle">): string {
  return ownerHandle === null ? SCHEDULE_CADENCE_LABELS[cadence] : `${SCHEDULE_CADENCE_LABELS[cadence]} · for ${ownerHandle}`;
}

/** A schedule row's enable switch: `Enabled: <schedule>`, with `aria-checked` carrying the state. */
export function scheduleEnabledSwitchName(schedule: ScheduleIdentity): string {
  return itemSwitchName(ITEM_ENABLED_SETTING, scheduleName(schedule));
}

export function scheduleEditName(schedule: ScheduleIdentity): string {
  return `Edit schedule: ${scheduleName(schedule)}`;
}

export function scheduleDeleteName(schedule: ScheduleIdentity): string {
  return `Delete schedule: ${scheduleName(schedule)}`;
}

/** The cadence picker items (in the contract's tuple order). */
export const SCHEDULE_CADENCE_ITEMS: readonly { value: string; label: string }[] = SCHEDULE_CADENCES.map((cadence) => ({
  value: cadence,
  label: SCHEDULE_CADENCE_LABELS[cadence],
}));

/** The schedule form values. Backs both the create and edit dialogs; the param slots mirror the run form
 *  so `buildStartInput` assembles the same wire input a manual run would. */
export interface CreateScheduleFormValues extends WorkloadRunValues {
  readonly kind: WorkloadKind;
  readonly cadence: ScheduleCadence;
  /** Owner-only bulk (all-owners recurring sweep) toggle — a non-owner's dialog never renders the field. */
  readonly bulk: boolean;
}

export const CREATE_SCHEDULE_FORM_DEFAULTS: CreateScheduleFormValues = {
  kind: RUNNABLE_WORKLOAD_KINDS[0] ?? "index",
  cadence: "daily",
  bulk: false,
  force: false,
  dryRun: false,
  k: null,
  source: "all",
  assetKind: "",
};

// Extract the run-param slots from a schedule row's stored `params` blob — the inverse of `buildStartInput`, seeding the edit dialog's controls.
//

function scheduleParamsToRunValues(params: Record<string, unknown>): WorkloadRunValues {
  const source = params["source"];
  const k = params["k"];
  return {
    force: params["force"] === true,
    dryRun: params["dryRun"] === true,
    k: typeof k === "number" ? k : null,
    source: source === "text" || source === "image" || source === "all" ? source : "all",
    assetKind: ASSET_KINDS.find((kind) => kind === params["kind"]) ?? "",
  };
}

type ScheduleUpdate = inferInput<Trpc["workloads"]["updateSchedule"]>;
type StoredSchedule = inferOutput<Trpc["workloads"]["listSchedules"]>[number];
type ScheduleSeed = Pick<StoredSchedule, keyof NonNullable<ScheduleUpdate["input"]> | keyof Pick<ScheduleUpdate, "mode" | "cadence">>;

/** Stored params may predate the current per-kind input. Project only editable controls. */
export function scheduleFormValuesFromRow(row: ScheduleSeed): CreateScheduleFormValues {
  return {
    kind: row.kind,
    cadence: row.cadence,
    bulk: row.mode === "bulk",
    ...scheduleParamsToRunValues(row.params),
  };
}
