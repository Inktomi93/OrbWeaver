// The Schedule dialogs (Settings → Workloads → Schedules) — CREATE and in-place EDIT over one shared form
// body. A COMPONENT so the Dialog root is legal (client-structure rule 7; the run-workload-dialog precedent).
// The body is the §13.4 factory (`useCreateScheduleForm` — the create + edit forms share ONE value shape, so
// one factory backs both), button-gated: submit fires `form.handleSubmit()` whose `save` fires
// `workloads.createSchedule` (create) or `workloads.updateSchedule` (edit) and closes on success; a failure
// keeps the dialog open (errorToast + the sticky inline error). Base UI unmounts the closed popup, so every
// open mounts a FRESH form — a reopened create never carries the previous pick, and each edit seeds from its
// own row (`serverValues` + the row-id `entityId` remount key).
//
// The kind picker is DRIVEN OFF THE CONTRACT: a non-owner sees the singular-capable built kinds
// (`RUNNABLE_WORKLOAD_KINDS`); the box owner sees a GROUPED picker adding the "Maintenance (all deployments)"
// group (the built bulk-only kinds — a system-wide recurring sweep) + a Bulk toggle on the bulk-schedulable
// sweep kinds. Schedules carry NO mint target (createSchedule/updateSchedule take none), so a bulk CREATE-kind
// (import-st) is NOT bulk-schedulable — its toggle never renders. `resolveScheduleMode` maps kind + toggle to
// the wire `mode`; the server re-gates bulk on `requireOwner` (the floor). The param controls reuse the run
// dialog's shape map, so a scheduled run enqueues exactly what a manual run would.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useCreateScheduleForm } from "../hooks/use-create-schedule-form";
import { useCreateSchedule, useUpdateSchedule } from "../hooks/use-workload-mutations";
import {
  buildStartInput,
  isMaintenanceWorkloadKind,
  isStartableWorkloadKind,
  workloadKindItems,
} from "../lib/workloads-model";
import type { CreateScheduleFormValues } from "../lib/workloads-schedule-model";
import {
  resolveScheduleMode,
  SCHEDULE_CADENCE_ITEMS,
  scheduleFormValuesFromRow,
  workloadKindBulkSchedulable,
} from "../lib/workloads-schedule-model";
import { WorkloadParamFields } from "./workload-kind-fields";

type ScheduleItem = inferOutput<Trpc["workloads"]["listSchedules"]>[number];

export interface CreateScheduleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Only the box owner gets the Maintenance group + the Bulk toggle (`createSchedule` bulk = `requireOwner`). */
  readonly viewerIsOwner: boolean;
}

export interface EditScheduleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly viewerIsOwner: boolean;
  /** The schedule being retuned — seeds the form (kind/cadence/mode/params) + supplies the update id. */
  readonly schedule: ScheduleItem;
}

/** The CREATE dialog shell — a fresh form per open (Base UI unmounts closed popups). */
export function CreateScheduleDialog({
  open,
  onOpenChange,
  viewerIsOwner,
}: CreateScheduleDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup data-testid={testId("createScheduleDialog")}>
        <Stack gap="block">
          <DialogTitle>Create a schedule</DialogTitle>
          <DialogDescription>
            Runs a background job on a recurring cadence. Each run queues automatically and shows in
            the Jobs list.
          </DialogDescription>
          <ScheduleFormBody
            viewerIsOwner={viewerIsOwner}
            onDone={(): void => onOpenChange(false)}
          />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** The EDIT dialog shell — seeds from the row; the row id keys the remount so switching rows re-seeds. */
export function EditScheduleDialog({
  open,
  onOpenChange,
  viewerIsOwner,
  schedule,
}: EditScheduleDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup data-testid={testId("editScheduleDialog")}>
        <Stack gap="block">
          <DialogTitle>Edit schedule</DialogTitle>
          <DialogDescription>
            Retune this recurring job — change what it runs, its cadence, or (owner) its scope.
            Enable and pause stay on the row switch.
          </DialogDescription>
          <ScheduleFormBody
            viewerIsOwner={viewerIsOwner}
            schedule={schedule}
            onDone={(): void => onOpenChange(false)}
          />
        </Stack>
      </DialogPopup>
    </Dialog>
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
      // Unreachable through the picker (its items derive from the same startable lists) — refuse quietly.
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
      <form.AppField name="kind">
        {(field): ReactElement => <field.SelectField label="Workload" items={kindItems} />}
      </form.AppField>
      <form.AppField name="cadence">
        {(field): ReactElement => <field.SelectField label="Runs" items={CADENCE_ITEMS} />}
      </form.AppField>
      <WorkloadParamFields form={form} />
      {viewerIsOwner ? (
        <form.Subscribe selector={(state): string => state.values.kind}>
          {(kind): ReactElement | null => {
            // A maintenance (built bulk-only) kind recurs across every deployment BY FORCE — a note, not a
            // toggle. A bulk-schedulable sweep kind gets the owner's Bulk toggle; everything else neither.
            if (isMaintenanceWorkloadKind(kind)) {
              return (
                <Text size="label" tone="muted">
                  Recurs across every deployment (maintenance) — there's no per-user version.
                </Text>
              );
            }
            return workloadKindBulkSchedulable(kind) ? (
              <form.AppField name="bulk">
                {(field): ReactElement => (
                  <field.SwitchField
                    label="Bulk mode"
                    description="Owner only — recurs across every user's data instead of just yours."
                  />
                )}
              </form.AppField>
            ) : null;
          }}
        </form.Subscribe>
      ) : null}
      {hasError ? (
        <Text size="label" tone="destructive">
          {isEdit
            ? "Couldn't update the schedule. Try again."
            : "Couldn't create the schedule. Try again."}
        </Text>
      ) : null}
      <Stack align="end">
        <Button
          intent="primary"
          disabled={isPending}
          data-testid={testId(isEdit ? "editScheduleSubmit" : "createScheduleSubmit")}
          onClick={(): void => {
            void form.handleSubmit();
          }}
        >
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
