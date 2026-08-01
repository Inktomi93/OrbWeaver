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
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import type { SelectOption } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { FormDialog, FormSubmitButton } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { timeLib } from "#lib";
import { useRunWorkloadForm } from "../hooks/use-run-workload-form";
import { useStartWorkload } from "../hooks/use-workload-mutations";
import type { RunWorkloadFormValues } from "../lib/workloads-model";
import {
  buildStartInput,
  isMaintenanceWorkloadKind,
  isRunnableWorkloadKind,
  isStartableWorkloadKind,
  WORKLOAD_KIND_LABELS,
  workloadKindItems,
  workloadKindNeedsBulkTarget,
} from "../lib/workloads-model";
import { parseRunAt } from "../lib/workloads-run-model";
import { MaintenanceKindNote } from "./maintenance-kind-note";
import { WorkloadParamFields } from "./workload-kind-fields";

type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

/** A candidate for the `dependsOn` gate — one of the viewer's currently in-flight (queued/running) runs. */
interface DependencyCandidate {
  readonly id: string;
  readonly kind: string;
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
    <FormDialog
      description="Runs a background job over your own library. It queues immediately; progress shows live in the list."
      onOpenChange={onOpenChange}
      open={open}
      testKey="runWorkloadDialog"
      title="Run a job"
    >
      <RunWorkloadFormBody dependencyCandidates={dependencyCandidates} onDone={(): void => onOpenChange(false)} users={users} viewerIsOwner={viewerIsOwner} />
    </FormDialog>
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
  const start = useStartWorkload({ trpc, invalidation });

  const targetItems = users.filter((user) => user.enabled).map((user) => ({ value: user.id as string, label: user.handle as string }));

  const dependencyItems: readonly SelectOption<string>[] = dependencyCandidates.map((candidate) => ({
    value: candidate.id,
    label: `${WORKLOAD_KIND_LABELS[candidate.kind as WorkloadKind]} · ${timeLib.formatRelative(candidate.createdAt)}`,
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
    await start.mutateAsync({
      input: buildStartInput(values.kind, values),
      mode: bulkOn ? "bulk" : "singular",
      ...(needsTarget ? { targetOwnerId: values.targetOwnerId } : {}),
      ...(scheduledAt === undefined ? {} : { scheduledAt }),
      ...(values.dependsOn.length > 0 ? { dependsOn: [...values.dependsOn] } : {}),
    });
    onDone();
    return values;
  };

  const { form } = useRunWorkloadForm({ entityId: "run-workload", serverValues: undefined, save });
  const kindItems = workloadKindItems(viewerIsOwner);

  return (
    <Stack gap="block">
      <form.AppField name="kind">{(field): ReactElement => <field.SelectField label="Job" items={kindItems} />}</form.AppField>
      <WorkloadParamFields form={form} />
      {viewerIsOwner ? (
        <form.Subscribe selector={(state): string => state.values.kind}>
          {(kind): ReactElement | null => {
            if (isMaintenanceWorkloadKind(kind)) {
              return <MaintenanceKindNote verb="Runs" />;
            }
            return isRunnableWorkloadKind(kind) && WORKLOAD_KIND_MODES[kind].bulk ? (
              <form.AppField name="bulk">
                {(field): ReactElement => (
                  <field.SwitchField label="Bulk mode" description="Owner only — runs across every user's data instead of just yours." />
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
        <Text voice="label" className="text-destructive">
          Couldn't start the workload — a run of that kind may already be active.
        </Text>
      )}
      <FormSubmitButton
        disabled={start.isPending}
        label={start.isPending ? "Starting…" : "Run job"}
        onSubmit={(): void => {
          void form.handleSubmit();
        }}
        testKey="runWorkloadSubmit"
      />
    </Stack>
  );
}
