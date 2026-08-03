// The create-schedule form (Settings → Workloads → Schedules; UI-Arch §13.4 — a ≥3-field form rides a
// factory, never hand-rolled controlled state). Built on `createSavedEntityForm` at MODULE scope (stable
// hook identity, §13.1). Button-gated: the dialog's Create button submits; the `save` seam is supplied at
// CALL time (it closes over the live `createSchedule` mutation). `serverValues` is always undefined (a new
// schedule has no server row) so `defaultValues` seeds every open; Base UI unmounts the closed popup, so a
// reopened dialog never carries the previous pick. No cross-field validation — every field has a default.

import { createSavedEntityForm } from "#forms";
import type { CreateScheduleFormValues } from "../lib/workloads-schedule-model.ts";
import { CREATE_SCHEDULE_FORM_DEFAULTS } from "../lib/workloads-schedule-model.ts";

export const useCreateScheduleForm = createSavedEntityForm<CreateScheduleFormValues>({
  defaultValues: CREATE_SCHEDULE_FORM_DEFAULTS,
});
