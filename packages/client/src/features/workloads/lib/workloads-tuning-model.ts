// The Workloads-tuning settings-section FORM projection (Phase B ⑤) — the analysis knobs the workloads
// runners read (`UserSettings.workloads`): dupThreshold (the character dedup cosine floor), computeThemesK
// (theme k-means cluster count), maxPairs + hubFraction (the cooccurrence pass). All are OPTIONAL on the
// stored blob (absent ⇒ the runner's own floor governs — the server's `settings.workloads.X ?? FLOOR`); this
// form is the OVERRIDE editor, so it seeds each field from the runner floor for display and writes a concrete
// value on change. Bounds mirror `@orb/contracts/settings`' workloadsSchema (the server re-validates + the
// lenient tier self-heals, so these bound the INPUT for UX, never the enforcement).

import type { UserSettings } from "@orb/contracts/settings";

type WorkloadsSection = UserSettings["workloads"];

/** The flat form shape — one field per bound control. */
export interface WorkloadsTuningForm {
  readonly dupThreshold: number;
  readonly computeThemesK: number;
  readonly maxPairs: number;
  readonly hubFraction: number;
}

export const DUP_THRESHOLD_MIN = 0;
export const DUP_THRESHOLD_MAX = 1;
export const COMPUTE_THEMES_K_MIN = 1;
export const COMPUTE_THEMES_K_MAX = 100;
export const MAX_PAIRS_MIN = 100;
export const MAX_PAIRS_MAX = 1_000_000;
export const HUB_FRACTION_MIN = 0;
export const HUB_FRACTION_MAX = 1;

// The DISPLAY seeds — the runner floors an absent override falls to (compute-themes DEFAULT_THEME_K=12;
// discovery DEFAULT_MAX_PAIRS=10000 / DEFAULT_HUB_FRACTION=0.5; duplicates DEFAULT_DUP_THRESHOLD=0.92). These
// are server-tier consts the client can't import, mirrored here for the form's initial value ONLY — the
// server's `?? FLOOR` remains the true fallback for a user who never edits these.
const DUP_THRESHOLD_FLOOR_DISPLAY = 0.92;
const COMPUTE_THEMES_K_FLOOR_DISPLAY = 12;
const MAX_PAIRS_FLOOR_DISPLAY = 10_000;
const HUB_FRACTION_FLOOR_DISPLAY = 0.5;

/** Stored workloads section → the flat form value (override ?? the floor-display seed). */
export function projectWorkloadsTuningForm(section: WorkloadsSection): WorkloadsTuningForm {
  return {
    dupThreshold: section.dupThreshold ?? DUP_THRESHOLD_FLOOR_DISPLAY,
    computeThemesK: section.computeThemesK ?? COMPUTE_THEMES_K_FLOOR_DISPLAY,
    maxPairs: section.maxPairs ?? MAX_PAIRS_FLOOR_DISPLAY,
    hubFraction: section.hubFraction ?? HUB_FRACTION_FLOOR_DISPLAY,
  };
}

/** The flat form value → the `workloads` section-patch shape `updateUserSettingsSection("workloads")` merges. */
export function toWorkloadsSectionPatch(form: WorkloadsTuningForm): Record<string, unknown> {
  return { dupThreshold: form.dupThreshold, computeThemesK: form.computeThemesK, maxPairs: form.maxPairs, hubFraction: form.hubFraction };
}
