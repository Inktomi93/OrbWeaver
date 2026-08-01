// Shared helpers for the AppSettings admin-override SECTIONS (Phase B ③: rate limits, memory tuning,
// summarizer; SET-SEAMS stage 4: media & trust, compute, shared access, multi-user, operations). The
// floor-vs-override display + delta-save logic is identical across them; this is its one home (lib, no JSX
// — a component module can't co-export a non-component, useComponentExportOnlyModules).

import type { SaveLifecycleState } from "#state";

/** One AppSettings-section mutation's lifecycle as the settings save-status seam's three states (SET-SEAMS
 *  §3). A section with its OWN save affordance still REPORTS, so the shell's aggregate footer and the nav
 *  marker see its failure — eight sections share this mapping, so it lives here rather than per-section. */
export function saveStateOf(isPending: boolean, errored: boolean): SaveLifecycleState {
  if (errored) {
    return "error";
  }
  return isPending ? "saving" : "saved";
}

/** Is this stored-override value actively set? `null`/`undefined` = the deployment floor governs; anything
 *  else (INCLUDING `0` / `false`) = an active override. The nullish check is load-bearing — a falsy check
 *  would wrongly read `recencyBias: 0` / `keywordMatch: false` as "not overridden". */
export function isOverridden(v: unknown): boolean {
  return v !== null && v !== undefined;
}

/** The floor label for an ENV-LAYERED `AppSettings` key. While NO override is stored the resolved value IS
 *  the deployment floor, so it can be named; once an override is stored the floor is not recoverable
 *  client-side (`getAppSettingsWithOverrides` returns floor ⊕ override, never the bare floor), so this
 *  returns `null` and the row says "clear it to fall back" instead of printing the override AS its own
 *  default — the lie SET-SEAMS §4 set out to kill along with the pane's footnote. */
export function envFloorLabel(overridden: boolean, resolvedValue: string): string | null {
  return overridden ? null : resolvedValue;
}

/** Does a NESTED override object carry at least one actively-set field? (`null`/`undefined` blob → no.) */
export function anyFieldOverridden(nested: Record<string, unknown> | null | undefined): boolean {
  return nested !== null && nested !== undefined && Object.values(nested).some(isOverridden);
}
