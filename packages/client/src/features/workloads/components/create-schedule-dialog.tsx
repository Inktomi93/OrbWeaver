// The Schedule dialogs (Settings → Workloads → Schedules) — create and in-place edit over one shared
// form body (useCreateScheduleForm — the two forms share one value shape). Submit fires
// createSchedule/updateSchedule and closes on success; a failure keeps the dialog open. Base UI unmounts
// the closed popup, so every open mounts a fresh form.
//
// The kind picker is driven off the contract: a non-owner sees the runnable built kinds; the owner sees a
// grouped picker adding maintenance kinds + a Bulk toggle on bulk-schedulable sweep kinds. Schedules carry
// no mint target, so a bulk create-kind is not bulk-schedulable. The param controls reuse the run
// dialog's shape map.

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import {
  FormDialogPopup,
  FormDialogRoot,
  ModelRunConfirmDialog,
  SCHEDULE_SAVE_ESTIMATE_FAILED,
  SCHEDULE_SAVE_OWNER_ONLY,
  useModelRunConfirm,
} from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useCreateScheduleForm } from "../hooks/use-create-schedule-form.ts";
import { useCreateSchedule, useUpdateSchedule } from "../hooks/use-workload-mutations.ts";
import { buildStartInput, isMaintenanceWorkloadKind, isStartableWorkloadKind, WORKLOAD_KIND_LABELS, workloadKindItems } from "../lib/workloads-model.ts";
import {
  SCHEDULE_CADENCE_FIELD_NAME,
  SCHEDULE_CREATE_FAILED,
  SCHEDULE_CREATE_NAME,
  SCHEDULE_CREATE_TITLE,
  SCHEDULE_SAVE_NAME,
  WORKLOAD_JOB_FIELD_NAME,
} from "../lib/workloads-names.ts";
import type { CreateScheduleFormValues } from "../lib/workloads-schedule-model.ts";
import { resolveScheduleMode, SCHEDULE_CADENCE_ITEMS, scheduleFormValuesFromRow, workloadKindBulkSchedulable } from "../lib/workloads-schedule-model.ts";
import { MaintenanceKindNote } from "./maintenance-kind-note.tsx";
import { WorkloadParamFields } from "./workload-kind-fields.tsx";

type ScheduleItem = inferOutput<Trpc["workloads"]["listSchedules"]>[number];

export interface CreateScheduleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Only the box owner gets the Maintenance group + the Bulk toggle. */
  readonly viewerIsOwner: boolean;
}

export interface EditScheduleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly viewerIsOwner: boolean;
  /** The schedule being retuned — seeds the form + supplies the update id. */
  readonly schedule: ScheduleItem;
}

export function CreateScheduleDialog({ open, onOpenChange, viewerIsOwner }: CreateScheduleDialogProps): ReactElement {
  return (
    <FormDialogRoot onOpenChange={onOpenChange} open={open}>
      <ScheduleFormBody onDone={(): void => onOpenChange(false)} viewerIsOwner={viewerIsOwner} />
    </FormDialogRoot>
  );
}

export function EditScheduleDialog({ open, onOpenChange, viewerIsOwner, schedule }: EditScheduleDialogProps): ReactElement {
  return (
    <FormDialogRoot onOpenChange={onOpenChange} open={open}>
      <ScheduleFormBody onDone={(): void => onOpenChange(false)} schedule={schedule} viewerIsOwner={viewerIsOwner} />
    </FormDialogRoot>
  );
}

const CADENCE_ITEMS: SelectItems = SCHEDULE_CADENCE_ITEMS.map((item) => ({
  value: item.value,
  label: item.label,
}));

/** The shared create/edit body — `schedule` present = edit (seeds + updates by id), absent = create. */
function ScheduleFormBody({
  viewerIsOwner,
  schedule,
  onDone,
}: {
  readonly viewerIsOwner: boolean;
  readonly schedule?: ScheduleItem;
  readonly onDone: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateSchedule({ trpc, invalidation });
  const update = useUpdateSchedule({ trpc, invalidation });
  const paidRun = useModelRunConfirm();
  const isEdit = schedule !== undefined;

  const save = async (values: CreateScheduleFormValues): Promise<CreateScheduleFormValues> => {
    if (!isStartableWorkloadKind(values.kind)) {
      return values;
    }
    const kind: WorkloadKind = values.kind;
    const mode = resolveScheduleMode(kind, values.bulk, viewerIsOwner);
    const input = buildStartInput(kind, values);
    // A schedule spends on every run with no one there to confirm it, so the yes is asked here, once, with the
    // size of one run as the library stands now.
    await paidRun.confirmThen({
      title: `Schedule ${WORKLOAD_KIND_LABELS[kind]}?`,
      confirmLabel: schedule === undefined ? SCHEDULE_CREATE_NAME : SCHEDULE_SAVE_NAME,
      recurring: true,
      estimates: [{ input, mode }],
      estimateFailedTitle: SCHEDULE_SAVE_ESTIMATE_FAILED,
      ownerOnlyNotice: SCHEDULE_SAVE_OWNER_ONLY,
      run: async (): Promise<void> => {
        if (schedule === undefined) {
          await create.mutateAsync({ input, cadence: values.cadence, mode });
        } else {
          await update.mutateAsync({ id: schedule.id, input, cadence: values.cadence, mode });
        }
        onDone();
      },
    });
    return values;
  };

  const { form } = useCreateScheduleForm({
    entityId: isEdit ? schedule.id : "create-schedule",
    serverValues: schedule === undefined ? undefined : scheduleFormValuesFromRow(schedule),
    save,
  });
  const kindItems = workloadKindItems(viewerIsOwner);
  const write = isEdit ? update : create;
  const isPending = write.isPending;
  const hasError = write.error !== null;
  const pendingLabel = isEdit ? "Saving…" : "Creating…";
  const idleLabel = isEdit ? SCHEDULE_SAVE_NAME : SCHEDULE_CREATE_NAME;
  const submitLabel = isPending ? pendingLabel : idleLabel;
  const failedLine = isEdit ? "Couldn't update the schedule. Try again." : SCHEDULE_CREATE_FAILED;

  return (
    <FormDialogPopup
      description={
        isEdit
          ? "Retune this recurring job: change what it runs, its cadence, or (owner) its scope. Enable and pause stay on the row switch."
          : "Runs a background job on a recurring cadence. Each run queues automatically and shows in the Jobs list."
      }
      submit={{
        label: submitLabel,
        disabled: isPending,
        testKey: isEdit ? "editScheduleSubmit" : "createScheduleSubmit",
        onSubmit: (): void => {
          // The save's failure is already said, inline or by the toast; the rethrow carries nothing new.
          form.handleSubmit().catch(() => undefined);
        },
      }}
      testKey={isEdit ? "editScheduleDialog" : "createScheduleDialog"}
      title={isEdit ? "Edit schedule" : SCHEDULE_CREATE_TITLE}
    >
      <form.AppField name="kind">{(field): ReactElement => <field.SelectField label={WORKLOAD_JOB_FIELD_NAME} items={kindItems} />}</form.AppField>
      <form.AppField name="cadence">{(field): ReactElement => <field.SelectField label={SCHEDULE_CADENCE_FIELD_NAME} items={CADENCE_ITEMS} />}</form.AppField>
      <WorkloadParamFields form={form} />
      {viewerIsOwner ? (
        <form.Subscribe selector={(state): string => state.values.kind}>
          {(kind): ReactElement | null => {
            if (isMaintenanceWorkloadKind(kind)) {
              return <MaintenanceKindNote verb="Recurs" />;
            }
            return workloadKindBulkSchedulable(kind) ? (
              <form.AppField name="bulk">
                {(field): ReactElement => (
                  <field.SwitchField label="Bulk mode" description="Owner only. Recurs across every user's data instead of just yours." />
                )}
              </form.AppField>
            ) : null;
          }}
        </form.Subscribe>
      ) : null}
      {/* While the paid-run confirm is up it is the retry surface and says the failure itself; this line speaks once it is gone. */}
      {hasError && paidRun.dialog.pending === null ? (
        <Text role="alert" tone="destructive" voice="label">
          {failedLine}
        </Text>
      ) : null}
      <ModelRunConfirmDialog {...paidRun.dialog} nested={true} />
    </FormDialogPopup>
  );
}
