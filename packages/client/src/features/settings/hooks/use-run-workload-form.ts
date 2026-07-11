// The run-workload form (Settings → Workloads; UI-Arch §13.4 — ≥3 fields + validation ⇒ a form
// factory, never hand-rolled controlled state). Built on `createSavedEntityForm` at MODULE scope
// (stable hook identity, §13.1). Button-gated: the dialog's Run button submits; the `save` seam is
// supplied at CALL time (it closes over the live `startWorkload` mutation + the viewer's owner flag).
// `serverValues` is always undefined (a run has no server row) so `defaultValues` seeds every open;
// Base UI unmounts the closed popup, so a reopened dialog never shows the previous pick.
//
// Validation is plain-function `onDynamic` (revalidateLogic: validate on submit, then live): a BULK
// run of a create-kind (`bulkRequiresTarget`) must designate its mint target — mirrors the start
// verb's own requirement as teaching; the verb (LAYER-2) remains the enforcement floor.

import { createSavedEntityForm } from "#forms";
import type { RunWorkloadFormValues } from "../lib/workloads-model";
import { RUN_WORKLOAD_FORM_DEFAULTS, workloadKindNeedsBulkTarget } from "../lib/workloads-model";

export const useRunWorkloadForm = createSavedEntityForm<RunWorkloadFormValues>({
  defaultValues: RUN_WORKLOAD_FORM_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({
        value,
      }: {
        value: RunWorkloadFormValues;
      }): { fields: Record<string, string> } | undefined =>
        value.bulk && workloadKindNeedsBulkTarget(value.kind) && value.targetOwnerId === ""
          ? { fields: { targetOwnerId: "Pick the user to import into." } }
          : undefined,
    },
  },
});
