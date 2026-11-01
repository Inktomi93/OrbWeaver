// The run-workload form, built on createSavedEntityForm at module scope. `serverValues` is always
// undefined (a run has no server row) so `defaultValues` seeds every open. A bulk run of a create-kind
// must designate its mint target — mirrors the start verb's own requirement as teaching.

import { createSavedEntityForm } from "#forms/editor";
import type { RunWorkloadFormValues } from "../lib/workloads-model.ts";
import { RUN_WORKLOAD_FORM_DEFAULTS, workloadKindNeedsAssetKind, workloadKindNeedsBulkTarget } from "../lib/workloads-model.ts";

export const useRunWorkloadForm = createSavedEntityForm<RunWorkloadFormValues>({
  defaultValues: RUN_WORKLOAD_FORM_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: RunWorkloadFormValues }): { fields: Record<string, string> } | undefined => {
        if (value.bulk && workloadKindNeedsBulkTarget(value.kind) && value.targetOwnerId === "") {
          return { fields: { targetOwnerId: "Pick the user to import into." } };
        }
        return workloadKindNeedsAssetKind(value.kind) && value.assetKind === "" ? { fields: { assetKind: "Choose what to rebuild." } } : undefined;
      },
    },
  },
});
