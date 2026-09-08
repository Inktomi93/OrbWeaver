// The workloads-tuning autosave form (Phase B ⑤), mounted through the D78 session boundary at module scope —
// the boundary OWNS the (constant) entity key (autosave-form-doctrine.md §1/§8, D78 L4). `defaultValues` is a
// type-level fallback: the surface renders inside a QueryBoundary after getUserSettings resolves, so the
// projected server values always fully override these seeds.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms/editor";
import type { WorkloadsTuningForm } from "../lib/workloads-tuning-model.ts";
import { projectWorkloadsTuningForm } from "../lib/workloads-tuning-model.ts";

/** The singleton entity id — the workloads tuning is one row per user, so a fixed key. */
export const WORKLOADS_TUNING_ENTITY_ID = "workloads-tuning";

export const WorkloadsTuningAutosaveForm = createAutosaveEntityForm<WorkloadsTuningForm>({
  defaultValues: projectWorkloadsTuningForm(DEFAULT_USER_SETTINGS.workloads),
});
