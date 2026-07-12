// workload-kind-fields — the per-kind param CONTROL block shared by `run-workload-dialog.tsx` and
// `create-schedule-dialog.tsx` (C4). The two dialogs render the EXACT same param controls for a given
// kind so a scheduled run enqueues what a manual run would — hand-keeping two copies in sync was the
// invariant's only guard; this extraction makes it structural (one block, two callers). Generic over
// the caller's own form-value shape (they differ — `bulk` alone vs `bulk`+`cadence` — but both satisfy
// {@link WorkloadRunValues} + carry `kind`, the only fields this block reads/writes). The kind-picker
// item builder (`workloadKindItems`) lives in `lib/workloads-model.ts` (a plain function can't share
// this component-only module per `useComponentExportOnlyModules`).

import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import type { WorkloadRunValues } from "../lib/workloads-model";
import {
  INDEX_SOURCE_ITEMS,
  isRunnableWorkloadKind,
  WORKLOAD_PARAM_SHAPE_BY_KIND,
} from "../lib/workloads-model";

/** The active kind's param controls — the 63-line block shared byte-for-byte between the run and
 *  schedule dialogs. Reads `form.values.kind` to pick the shape (mirrors the server's `PARAMS_SCHEMAS`
 *  family, named in `WORKLOAD_PARAM_SHAPE_BY_KIND`); renders nothing for `none`/`managed`. */
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
