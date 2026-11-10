// The Run-workload dialog. Button-gated: Run submits form.handleSubmit(), whose save fires the
// workloads.start mutation and closes on success. Base UI unmounts the popup while closed, so every open
// mounts a fresh form.
//
// The kind picker is driven off the contract (RUNNABLE_WORKLOAD_KINDS), so a kind flipping stub→built
// appears with zero edits here. The bulk affordances are owner-only UX honesty over the server floor
// (start gates bulk on requireOwner regardless). A bulk create-kind must designate its mint target from
// the admin user table filtered to enabled humans.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import type { SelectOption } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { z } from "zod";
import { FormDialogPopup, FormDialogRoot, ModelRunConfirmDialog, useModelRunConfirm } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import { useRunWorkloadForm } from "../hooks/use-run-workload-form.ts";
import { useStartWorkload } from "../hooks/use-workload-mutations.ts";
import type { RunWorkloadFormValues, WorkloadRunRequestScope } from "../lib/workloads-model.ts";
import {
  buildStartInput,
  isMaintenanceWorkloadKind,
  isRunnableWorkloadKind,
  isStartableWorkloadKind,
  WORKLOAD_KIND_LABELS,
  workloadKindItems,
  workloadKindNeedsBulkTarget,
} from "../lib/workloads-model.ts";
import { parseRunAt } from "../lib/workloads-run-model.ts";
import { MaintenanceKindNote } from "./maintenance-kind-note.tsx";
import { WorkloadParamFields } from "./workload-kind-fields.tsx";

/** The submit's verb, and the confirm's when the job calls a model. */
const RUN_LABEL = "Run job";

type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

/** A candidate for the `dependsOn` gate — one of the viewer's currently in-flight (queued/running) runs. */
const dependsOnSchema = z.array(typeIdSchema(ID_PREFIX.workload));

interface DependencyCandidate {
  readonly id: WorkloadId;
  readonly kind: WorkloadKind;
  readonly createdAt: number;
}

export interface RunWorkloadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Only the box owner gets the bulk switch + target picker. */
  readonly viewerIsOwner: boolean;
  /** The target-picker candidates (the admin user table) — `[]` for a non-owner viewer. */
  readonly users: readonly AdminUser[];
  /** The viewer's in-flight runs offered as `dependsOn` candidates. `[]` hides the gate. */
  readonly dependencyCandidates: readonly DependencyCandidate[];
}

export function RunWorkloadDialog({ open, onOpenChange, viewerIsOwner, users, dependencyCandidates }: RunWorkloadDialogProps): ReactElement {
  return (
    <FormDialogRoot onOpenChange={onOpenChange} open={open}>
      <RunWorkloadFormBody dependencyCandidates={dependencyCandidates} onDone={(): void => onOpenChange(false)} users={users} viewerIsOwner={viewerIsOwner} />
    </FormDialogRoot>
  );
}

function RunWorkloadFormBody({
  viewerIsOwner,
  users,
  dependencyCandidates,
  onDone,
}: {
  readonly viewerIsOwner: boolean;
  readonly users: readonly AdminUser[];
  readonly dependencyCandidates: readonly DependencyCandidate[];
  readonly onDone: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const start = useStartWorkload({ trpc, invalidation, failureShownInline: "the run-workload dialog's alert line" });
  const paidRun = useModelRunConfirm();

  const targetItems = users.filter((user) => user.enabled).map((user) => ({ value: user.id, label: user.handle }));

  const dependencyItems: readonly SelectOption[] = dependencyCandidates.map((candidate) => ({
    value: candidate.id,
    label: `${WORKLOAD_KIND_LABELS[candidate.kind]} · ${timeLib.formatRelative(candidate.createdAt)}`,
  }));

  const save = async (values: RunWorkloadFormValues): Promise<RunWorkloadFormValues> => {
    if (!isStartableWorkloadKind(values.kind)) {
      return values;
    }
    const isMaintenance = isMaintenanceWorkloadKind(values.kind);
    const bulkToggleOn = viewerIsOwner && values.bulk && WORKLOAD_KIND_MODES[values.kind].bulk;
    const bulkOn = isMaintenance || bulkToggleOn;
    const needsTarget = !isMaintenance && bulkToggleOn && WORKLOAD_KIND_MODES[values.kind].bulkRequiresTarget;
    const scheduledAt = parseRunAt(values.runAt);
    const target = needsTarget ? users.find((user) => user.id === values.targetOwnerId)?.id : undefined;
    // Parsed, never re-read from the candidates: they are the live active runs, and one that fails while this form is open
    // leaves them, where dropping it would start a paid run unconditionally. The server's gate judges the id.
    const dependsOn = dependsOnSchema.parse(values.dependsOn);
    const scope = {
      input: buildStartInput(values.kind, values),
      mode: bulkOn ? "bulk" : "singular",
      ...(target === undefined ? {} : { targetOwnerId: target }),
    } satisfies WorkloadRunRequestScope;
    await paidRun.confirmThen({
      title: `Run ${WORKLOAD_KIND_LABELS[values.kind]}?`,
      confirmLabel: RUN_LABEL,
      estimates: [scope],
      run: async (): Promise<void> => {
        await start.mutateAsync({
          ...scope,
          ...(scheduledAt === undefined ? {} : { scheduledAt }),
          ...(dependsOn.length > 0 ? { dependsOn } : {}),
        });
        onDone();
      },
    });
    return values;
  };

  const { form } = useRunWorkloadForm({ entityId: "run-workload", serverValues: undefined, save });
  const kindItems = workloadKindItems(viewerIsOwner);

  return (
    <FormDialogPopup
      description="Runs a background job over your own library. It queues immediately; progress shows live in the list."
      submit={{
        label: start.isPending ? "Starting…" : RUN_LABEL,
        disabled: start.isPending,
        testKey: "runWorkloadSubmit",
        onSubmit: (): void => {
          // The save's failure is already said, inline or by the toast; the rethrow carries nothing new.
          form.handleSubmit().catch(() => undefined);
        },
      }}
      testKey="runWorkloadDialog"
      title="Run a job"
    >
      <form.AppField name="kind">{(field): ReactElement => <field.SelectField label="Job" items={kindItems} />}</form.AppField>
      <WorkloadParamFields form={form} />
      {viewerIsOwner ? (
        <form.Subscribe selector={(state): string => state.values.kind}>
          {(kind): ReactElement | null => {
            if (isMaintenanceWorkloadKind(kind)) {
              return <MaintenanceKindNote verb="Runs" />;
            }
            return isRunnableWorkloadKind(kind) ? (
              <form.AppField name="bulk">
                {(field): ReactElement => (
                  <field.SwitchField label="Bulk mode" description="Owner only. Runs across every user's data instead of just yours." />
                )}
              </form.AppField>
            ) : null;
          }}
        </form.Subscribe>
      ) : null}
      {viewerIsOwner ? (
        <form.Subscribe
          selector={(state): boolean => state.values.bulk && !isMaintenanceWorkloadKind(state.values.kind) && workloadKindNeedsBulkTarget(state.values.kind)}
        >
          {(needsTarget): ReactElement | null =>
            needsTarget ? (
              <form.AppField name="targetOwnerId">
                {(field): ReactElement => (
                  <field.SelectField
                    label="Import into"
                    description="The user whose library receives the imported entities."
                    items={targetItems}
                    placeholder="Choose a user…"
                  />
                )}
              </form.AppField>
            ) : null
          }
        </form.Subscribe>
      ) : null}
      <form.Subscribe selector={(state): string => state.values.kind}>
        {(kind): ReactElement | null =>
          isRunnableWorkloadKind(kind) ? (
            <Stack gap="block">
              <form.AppField name="runAt">
                {(field): ReactElement => (
                  <Field label="Run at" description="Leave empty to run now. Set a date and time to defer this run." name={field.name}>
                    <Input
                      type="datetime-local"
                      value={field.state.value}
                      onChange={(event): void => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.AppField>
              {dependencyItems.length === 0 ? null : (
                <form.AppField name="dependsOn">
                  {(field): ReactElement => (
                    <field.MultiToggleField
                      label="Run after these complete"
                      description="This run waits until every selected job succeeds. If one fails, this run is skipped."
                      items={dependencyItems}
                    />
                  )}
                </form.AppField>
              )}
            </Stack>
          ) : null
        }
      </form.Subscribe>
      {start.error === null ? null : (
        <Text role="alert" tone="destructive" voice="label">
          Couldn't start the workload. A run of that kind may already be active.
        </Text>
      )}
      <ModelRunConfirmDialog {...paidRun.dialog} nested={true} />
    </FormDialogPopup>
  );
}
