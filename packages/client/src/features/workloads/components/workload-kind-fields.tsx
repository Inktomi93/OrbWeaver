// workload-kind-fields — the per-kind param control block shared by run-workload-dialog.tsx and
// create-schedule-dialog.tsx, so a scheduled run enqueues exactly what a manual run would. Generic over
// the caller's own form-value shape.

import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import type { WorkloadRunValues } from "../lib/workloads-model";
import {
  INDEX_SOURCE_ITEMS,
  isRunnableWorkloadKind,
  WORKLOAD_PARAM_SHAPE_BY_KIND,
} from "../lib/workloads-model";

/** The active kind's param controls, shared byte-for-byte between the run and schedule dialogs. */
export function WorkloadParamFields<TValues extends WorkloadRunValues & { readonly kind: string }>({
  form,
}: {
  readonly form: AppFormInstance<TValues>;
}): ReactElement | null {
  return (
    <form.Subscribe selector={(state): string => state.values.kind}>
      {(kind): ReactElement | null => {
        const shape = isRunnableWorkloadKind(kind) ? WORKLOAD_PARAM_SHAPE_BY_KIND[kind] : "none";
        if (shape === "index") {
          return (
            <>
              <form.AppField name="source">
                {(field): ReactElement => (
                  <field.SelectField label="What to index" items={INDEX_SOURCE_ITEMS} />
                )}
              </form.AppField>
              <form.AppField name="force">
                {(field): ReactElement => (
                  <field.SwitchField
                    label="Re-embed everything"
                    description="Ignore matching content and rebuild every vector."
                  />
                )}
              </form.AppField>
            </>
          );
        }
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
  );
}
