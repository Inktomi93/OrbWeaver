// The Run-workload dialog (Settings → Workloads). A COMPONENT so the Dialog root is legal
// (client-structure rule 7; the admin-create-user-dialog precedent). The body is the §13.4 factory
// (`useRunWorkloadForm` — ≥3 fields + validation), button-gated: Run submits `form.handleSubmit()`
// whose `save` fires the `workloads.start` mutation and closes on success; a failure keeps the dialog
// open (errorToast + the sticky inline error). Base UI unmounts the popup while closed, so every open
// mounts a FRESH form — a reopened dialog never carries the previous pick.
//
// The kind picker is DRIVEN OFF THE CONTRACT: `RUNNABLE_WORKLOAD_KINDS` = the singular-capable kinds
// per `WORKLOAD_KIND_MODES` (workloads-model.ts) — the unbuilt stubs are absent by construction, and a
// kind flipping stub→built appears with zero edits here. Default mode = SINGULAR (runs on the caller's
// own data; any authed user). The BULK affordances are OWNER-ONLY UX honesty over the server floor
// (`start` gates bulk on `requireOwner` regardless): a non-owner never renders the Bulk switch or the
// target picker. A bulk CREATE-kind (`bulkRequiresTarget`, e.g. import-st) must designate its mint
// target — submit is validation-blocked until one is picked; the target list is the admin user table
// filtered to enabled humans (a mint destination is a person's library, never an agent/disabled row).

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import type { SelectOption } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId, timeLib } from "#lib";
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
import { WorkloadParamFields } from "./workload-kind-fields";

type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

/** A candidate for the `dependsOn` gate — one of the viewer's currently in-flight (queued/running) runs. */
export interface DependencyCandidate {
  readonly id: string;
  readonly kind: string;
  readonly createdAt: number;
}

export interface RunWorkloadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Only the box owner gets the bulk switch + target picker (`start` bulk = `requireOwner`). */
  readonly viewerIsOwner: boolean;
  /** The target-picker candidates (the admin user table) — `[]` for a non-owner viewer. */
  readonly users: readonly AdminUser[];
  /** The viewer's in-flight runs offered as `dependsOn` candidates (queued/running). `[]` hides the gate. */
  readonly dependencyCandidates: readonly DependencyCandidate[];
}

/** The dialog shell — the form body mounts fresh per open (Base UI unmounts closed popups). */
export function RunWorkloadDialog({
  open,
  onOpenChange,
  viewerIsOwner,
  users,
  dependencyCandidates,
}: RunWorkloadDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup data-testid={testId("runWorkloadDialog")}>
        <Stack gap="block">
          <DialogTitle>Run a workload</DialogTitle>
          <DialogDescription>
            Runs a background job over your own library. It queues immediately; progress shows live
            in the list.
          </DialogDescription>
          <RunWorkloadFormBody
            viewerIsOwner={viewerIsOwner}
            users={users}
            dependencyCandidates={dependencyCandidates}
            onDone={(): void => onOpenChange(false)}
          />
        </Stack>
      </DialogPopup>
    </Dialog>
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

  // A mint destination is a person's live library — enabled humans only, never an agent/disabled row.
  const targetItems = users
    .filter((user) => user.kind === "human" && user.enabled)
    .map((user) => ({ value: user.id as string, label: user.handle as string }));

  // The DAG-gate candidates — the viewer's in-flight runs, labelled by kind + when they were queued.
  const dependencyItems: readonly SelectOption<string>[] = dependencyCandidates.map(
    (candidate) => ({
      value: candidate.id,
      label: `${WORKLOAD_KIND_LABELS[candidate.kind as WorkloadKind]} · ${timeLib.formatRelative(candidate.createdAt)}`,
    }),
  );

  const save = async (values: RunWorkloadFormValues): Promise<RunWorkloadFormValues> => {
    if (!isStartableWorkloadKind(values.kind)) {
      // Unreachable through the picker (its items derive from the same startable lists) — refuse quietly.
      return values;
    }
    // A maintenance (built bulk-only) kind is bulk BY FORCE — no singular mode, no target (a global
    // sweep). A singular-capable kind rides the owner's Bulk toggle (and a create-kind's target).
    const isMaintenance = isMaintenanceWorkloadKind(values.kind);
    const bulkToggleOn = viewerIsOwner && values.bulk && WORKLOAD_KIND_MODES[values.kind].bulk;
    const bulkOn = isMaintenance || bulkToggleOn;
    const needsTarget =
      !isMaintenance && bulkToggleOn && WORKLOAD_KIND_MODES[values.kind].bulkRequiresTarget;
    // Deferral + DAG gate ride on top of the run — omitted when unset (run-now, no gate). `scheduledAt` +
    // `dependsOn` inferInput are plain number/string[] (branded ids parse from the wire), so no cast here.
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
      <form.AppField name="kind">
        {(field): ReactElement => <field.SelectField label="Workload" items={kindItems} />}
      </form.AppField>
      <WorkloadParamFields form={form} />
      {viewerIsOwner ? (
        <form.Subscribe selector={(state): string => state.values.kind}>
          {(kind): ReactElement | null => {
            // A maintenance (built bulk-only) kind is bulk by force — a NOTE, not a toggle. A
            // singular-capable bulk-capable kind gets the owner's Bulk toggle; a singular-only kind
            // (no bulk mode) gets neither.
            if (isMaintenanceWorkloadKind(kind)) {
              return (
                <Text size="label" tone="muted">
                  Runs across every deployment (maintenance) — there's no per-user version.
                </Text>
              );
            }
            return isRunnableWorkloadKind(kind) && WORKLOAD_KIND_MODES[kind].bulk ? (
              <form.AppField name="bulk">
                {(field): ReactElement => (
                  <field.SwitchField
                    label="Bulk mode"
                    description="Owner only — runs across every user's data instead of just yours."
                  />
                )}
              </form.AppField>
            ) : null;
          }}
        </form.Subscribe>
      ) : null}
      {viewerIsOwner ? (
        <form.Subscribe
          selector={(state): boolean =>
            state.values.bulk &&
            !isMaintenanceWorkloadKind(state.values.kind) &&
            workloadKindNeedsBulkTarget(state.values.kind)
          }
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
      {/* Deferral + DAG gate — offered for the singular-capable (runnable) kinds; a maintenance-only kind
          is a global sweep with neither. "Run after" only renders when there are in-flight candidates. */}
      <form.Subscribe selector={(state): string => state.values.kind}>
        {(kind): ReactElement | null =>
          isRunnableWorkloadKind(kind) ? (
            <Stack gap="block">
              <form.AppField name="runAt">
                {(field): ReactElement => (
                  <Field
                    label="Run at"
                    description="Leave empty to run now. Set a date and time to defer this run."
                    name={field.name}
                  >
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
        <Text size="label" tone="destructive">
          Couldn't start the workload — a run of that kind may already be active.
        </Text>
      )}
      <Stack align="end">
        <Button
          intent="primary"
          disabled={start.isPending}
          data-testid={testId("runWorkloadSubmit")}
          onClick={(): void => {
            void form.handleSubmit();
          }}
        >
          {start.isPending ? "Starting…" : "Run workload"}
        </Button>
      </Stack>
    </Stack>
  );
}
