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

import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
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
import { useRunWorkloadForm } from "../hooks/use-run-workload-form";
import { useStartWorkload } from "../hooks/use-workload-mutations";
import type { RunWorkloadFormValues } from "../lib/workloads-model";
import {
  buildStartInput,
  isMaintenanceWorkloadKind,
  isRunnableWorkloadKind,
  isStartableWorkloadKind,
  MAINTENANCE_WORKLOAD_KINDS,
  RUNNABLE_WORKLOAD_KINDS,
  WORKLOAD_KIND_LABELS,
  WORKLOAD_PARAM_SHAPE_BY_KIND,
  workloadKindNeedsBulkTarget,
} from "../lib/workloads-model";

type AdminUser = inferOutput<Trpc["admin"]["listUsers"]>[number];

export interface RunWorkloadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Only the box owner gets the bulk switch + target picker (`start` bulk = `requireOwner`). */
  readonly viewerIsOwner: boolean;
  /** The target-picker candidates (the admin user table) — `[]` for a non-owner viewer. */
  readonly users: readonly AdminUser[];
}

/** The dialog shell — the form body mounts fresh per open (Base UI unmounts closed popups). */
export function RunWorkloadDialog({
  open,
  onOpenChange,
  viewerIsOwner,
  users,
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
            onDone={(): void => onOpenChange(false)}
          />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

const RUNNABLE_KIND_OPTIONS = RUNNABLE_WORKLOAD_KINDS.map((kind) => ({
  value: kind as string,
  label: WORKLOAD_KIND_LABELS[kind],
}));

const MAINTENANCE_KIND_OPTIONS = MAINTENANCE_WORKLOAD_KINDS.map((kind) => ({
  value: kind as string,
  label: WORKLOAD_KIND_LABELS[kind],
}));

// A non-owner sees the flat runnable list; the owner sees a GROUPED picker — "Run on my data" (the
// singular kinds) + a distinct "Maintenance (all deployments)" group (the built bulk-only kinds, e.g.
// refresh-model-catalog — a global sweep, no per-owner concept). The maintenance group is omitted when
// there are no built bulk-only kinds, so the owner never sees an empty group.
const NON_OWNER_KIND_ITEMS: SelectItems<string> = RUNNABLE_KIND_OPTIONS;
const OWNER_KIND_ITEMS: SelectItems<string> =
  MAINTENANCE_KIND_OPTIONS.length === 0
    ? RUNNABLE_KIND_OPTIONS
    : [
        { label: "Run on my data", items: RUNNABLE_KIND_OPTIONS },
        { label: "Maintenance (all deployments)", items: MAINTENANCE_KIND_OPTIONS },
      ];

function RunWorkloadFormBody({
  viewerIsOwner,
  users,
  onDone,
}: {
  readonly viewerIsOwner: boolean;
  readonly users: readonly AdminUser[];
  readonly onDone: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const start = useStartWorkload({ trpc, invalidation });

  // A mint destination is a person's live library — enabled humans only, never an agent/disabled row.
  const targetItems = users
    .filter((user) => user.kind === "human" && user.enabled)
    .map((user) => ({ value: user.id as string, label: user.handle as string }));

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
    await start.mutateAsync({
      input: buildStartInput(values.kind, values),
      mode: bulkOn ? "bulk" : "singular",
      ...(needsTarget ? { targetOwnerId: values.targetOwnerId } : {}),
    });
    onDone();
    return values;
  };

  const { form } = useRunWorkloadForm({ entityId: "run-workload", serverValues: undefined, save });
  const kindItems = viewerIsOwner ? OWNER_KIND_ITEMS : NON_OWNER_KIND_ITEMS;

  return (
    <Stack gap="block">
      <form.AppField name="kind">
        {(field): ReactElement => <field.SelectField label="Workload" items={kindItems} />}
      </form.AppField>
      <form.Subscribe selector={(state): string => state.values.kind}>
        {(kind): ReactElement | null => {
          const shape = isRunnableWorkloadKind(kind) ? WORKLOAD_PARAM_SHAPE_BY_KIND[kind] : "none";
          if (shape === "force") {
            return (
              <form.AppField name="force">
                {(field): ReactElement => (
                  <field.SwitchField
                    label="Re-embed everything"
                    description="Ignore matching content and rebuild every vector."
                  />
                )}
              </form.AppField>
            );
          }
          if (shape === "dryRun") {
            return (
              <form.AppField name="dryRun">
                {(field): ReactElement => (
                  <field.SwitchField
                    label="Dry run"
                    description="Report what the pass would do without changing anything."
                  />
                )}
              </form.AppField>
            );
          }
          if (shape === "k") {
            return (
              <form.AppField name="k">
                {(field): ReactElement => (
                  <field.NumberField
                    label="Cluster count"
                    description="Leave empty for the automatic default."
                    min={1}
                  />
                )}
              </form.AppField>
            );
          }
          return null;
        }}
      </form.Subscribe>
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
