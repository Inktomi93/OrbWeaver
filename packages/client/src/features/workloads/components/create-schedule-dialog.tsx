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
import { Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { FormDialog, FormSubmitButton } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useCreateScheduleForm } from "../hooks/use-create-schedule-form.ts";
import { useCreateSchedule, useUpdateSchedule } from "../hooks/use-workload-mutations.ts";
import { buildStartInput, isMaintenanceWorkloadKind, isStartableWorkloadKind, workloadKindItems } from "../lib/workloads-model.ts";
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
    <FormDialog
      description="Runs a background job on a recurring cadence. Each run queues automatically and shows in the Jobs list."
      onOpenChange={onOpenChange}
      open={open}
      testKey="createScheduleDialog"
      title="Create a schedule"
    >
      <ScheduleFormBody onDone={(): void => onOpenChange(false)} viewerIsOwner={viewerIsOwner} />
    </FormDialog>
  );
}

export function EditScheduleDialog({ open, onOpenChange, viewerIsOwner, schedule }: EditScheduleDialogProps): ReactElement {
  return (
    <FormDialog
      description="Retune this recurring job — change what it runs, its cadence, or (owner) its scope. Enable and pause stay on the row switch."
      onOpenChange={onOpenChange}
      open={open}
      testKey="editScheduleDialog"
      title="Edit schedule"
    >
      <ScheduleFormBody onDone={(): void => onOpenChange(false)} schedule={schedule} viewerIsOwner={viewerIsOwner} />
    </FormDialog>
  );
}

const CADENCE_ITEMS: SelectItems<string> = SCHEDULE_CADENCE_ITEMS.map((item) => ({
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
  const isEdit = schedule !== undefined;

  const save = async (values: CreateScheduleFormValues): Promise<CreateScheduleFormValues> => {
    if (!isStartableWorkloadKind(values.kind)) {
      return values;
    }
    const kind: WorkloadKind = values.kind;
    const mode = resolveScheduleMode(kind, values.bulk, viewerIsOwner);
    const input = buildStartInput(kind, values);
    if (schedule === undefined) {
      await create.mutateAsync({ input, cadence: values.cadence, mode });
    } else {
      await update.mutateAsync({ id: schedule.id, input, cadence: values.cadence, mode });
    }
    onDone();
    return values;
  };

  const { form } = useCreateScheduleForm({
    entityId: isEdit ? (schedule.id as string) : "create-schedule",
    serverValues: schedule === undefined ? undefined : scheduleFormValuesFromRow(schedule),
    save,
  });
  const kindItems = workloadKindItems(viewerIsOwner);
  const isPending = isEdit ? update.isPending : create.isPending;
  const hasError = (isEdit ? update.error : create.error) !== null;
  const pendingLabel = isEdit ? "Saving…" : "Creating…";
  const idleLabel = isEdit ? "Save schedule" : "Create schedule";
  const submitLabel = isPending ? pendingLabel : idleLabel;

  return (
    <Stack gap="block">
      <form.AppField name="kind">{(field): ReactElement => <field.SelectField label="Job" items={kindItems} />}</form.AppField>
      <form.AppField name="cadence">{(field): ReactElement => <field.SelectField label="Runs" items={CADENCE_ITEMS} />}</form.AppField>
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
                  <field.SwitchField label="Bulk mode" description="Owner only — recurs across every user's data instead of just yours." />
                )}
              </form.AppField>
            ) : null;
          }}
        </form.Subscribe>
      ) : null}
      {hasError ? (
        <Text voice="label" className="text-destructive">
          {isEdit ? "Couldn't update the schedule. Try again." : "Couldn't create the schedule. Try again."}
        </Text>
      ) : null}
      <FormSubmitButton
        disabled={isPending}
        label={submitLabel}
        onSubmit={(): void => {
          void form.handleSubmit();
        }}
        testKey={isEdit ? "editScheduleSubmit" : "createScheduleSubmit"}
      />
    </Stack>
  );
}
