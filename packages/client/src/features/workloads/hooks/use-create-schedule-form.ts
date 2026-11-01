// The create-schedule form (Settings → Workloads → Schedules; UI-Arch §13.4 — a ≥3-field form rides a
// factory, never hand-rolled controlled state). Built on `createSavedEntityForm` at MODULE scope (stable
// hook identity, §13.1). Button-gated: the dialog's Create button submits; the `save` seam is supplied at
// CALL time (it closes over the live `createSchedule` mutation). `serverValues` is always undefined (a new
// schedule has no server row) so `defaultValues` seeds every open; Base UI unmounts the closed popup, so a
// reopened dialog never carries the previous pick. The rebuild kind has no default asset kind, so the form refuses it until one is chosen.

import { createSavedEntityForm } from "#forms/editor";
import { workloadKindNeedsAssetKind } from "../lib/workloads-model.ts";
import type { CreateScheduleFormValues } from "../lib/workloads-schedule-model.ts";
import { CREATE_SCHEDULE_FORM_DEFAULTS } from "../lib/workloads-schedule-model.ts";

export const useCreateScheduleForm = createSavedEntityForm<CreateScheduleFormValues>({
  defaultValues: CREATE_SCHEDULE_FORM_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: CreateScheduleFormValues }): { fields: Record<string, string> } | undefined =>
        workloadKindNeedsAssetKind(value.kind) && value.assetKind === "" ? { fields: { assetKind: "Choose what to rebuild." } } : undefined,
    },
  },
});
