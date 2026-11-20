import { WORKLOAD_RUN_ACCOUNT_REFUSAL_SENTENCES } from "@orb/contracts/workloads";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { SectionPatchVars, Trpc } from "#data";
import { createEntityMutation } from "#data";
import { trpcErrorReason } from "#lib";

// The Workloads pane's mutations, one createEntityMutation per verb. None are busDriven: the workload
// verbs emit on the workloads progress bus (the `workloads` ROOM on the tab's one socket), not either mapped invalidation
// bus, so each self-invalidates the workloads.list read on settle.

/** Enqueue a run. The realistic refusal is the single-active-per-kind lock (`CONFLICT`). */
export const useStartWorkload = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, unknown>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't start the workload. A run of that kind may already be active.",
});

/** Request a stop on an active row (`queued`/`running` → `cancelling` → `cancelled`). */
export const useCancelWorkload = createEntityMutation<inferInput<Trpc["workloads"]["cancel"]>, unknown>({
  options: (trpc) => trpc.workloads.cancel.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't cancel the workload.",
});

/** Clone a terminal row into a fresh queued run (the original stays as the audit trail). */
export const useRetryWorkload = createEntityMutation<inferInput<Trpc["workloads"]["retry"]>, unknown>({
  options: (trpc) => trpc.workloads.retry.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Couldn't retry the workload. A run of that kind may already be active.",
});

/** Create a recurring schedule. */
export const useCreateSchedule = createEntityMutation<inferInput<Trpc["workloads"]["createSchedule"]>, unknown>({
  options: (trpc) => trpc.workloads.createSchedule.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.listSchedules.pathFilter()],
  errorToast: "Couldn't create the schedule.",
});

// A schedule keeps its owner, so a retune is judged against that account whoever saves it. The server codes those
// refusals, and each code's sentence is the contract's own.
const RUN_ACCOUNT_REFUSALS: ReadonlyMap<string, string> = new Map(Object.entries(WORKLOAD_RUN_ACCOUNT_REFUSAL_SENTENCES));

/** Retune a schedule in place (kind/params/cadence/mode). `enabled` is not here — that stays `setScheduleEnabled`.
 *  A refused run account toasts its reason, so the owner sees why a member's schedule cannot take the job. */
export const useUpdateSchedule = createEntityMutation<inferInput<Trpc["workloads"]["updateSchedule"]>, unknown>({
  options: (trpc) => trpc.workloads.updateSchedule.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.listSchedules.pathFilter()],
  errorToast: (error) => RUN_ACCOUNT_REFUSALS.get(trpcErrorReason(error)) ?? "Couldn't update the schedule.",
});

/** Pause/resume a schedule. The server judges no run account here, so it has no coded refusal to name. */
export const useSetScheduleEnabled = createEntityMutation<inferInput<Trpc["workloads"]["setScheduleEnabled"]>, unknown>({
  options: (trpc) => trpc.workloads.setScheduleEnabled.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.listSchedules.pathFilter()],
  errorToast: "Couldn't update the schedule.",
});

/** Delete a schedule. */
export const useDeleteSchedule = createEntityMutation<inferInput<Trpc["workloads"]["deleteSchedule"]>, unknown>({
  options: (trpc) => trpc.workloads.deleteSchedule.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.listSchedules.pathFilter()],
  errorToast: "Couldn't delete the schedule.",
});

export const useUpdateWorkloadsTuning = createEntityMutation<SectionPatchVars<"workloads">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your analysis-tuning settings.",
});
