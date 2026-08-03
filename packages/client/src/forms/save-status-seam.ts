// The REPORT half of the settings-section save-status seam (SET-SEAMS §3, S3) — the hooks + the hosting
// switch, split from `section-save-status.tsx` so a JSX module never mixes hook exports with a component
// export (useComponentExportOnlyModules; the settings-pane-registry-provider precedent).
//
// A section that renders `<SectionSaveStatus>` gets reporting for free (the component calls this); a
// section with its own save affordance (an explicit Save/Reset row, e.g. the AppSettings admin sections)
// reports with `useReportSaveStatus` alone, so the shell's aggregate footer still sees its failure.
//
// The hosting switch ("is an aggregate status host above me?") is a CONTEXT, not a store flag, so a section
// reads the truth on its FIRST render — a flag published by the host's effect would flash each section's
// inline status for one paint. `false` by default: a section mounted with no host (a pane not yet migrated,
// a CT story) renders its own inline status in every state, exactly as before the seam existed.

import { createContext, use, useEffect } from "react";
import type { SaveLifecycleState } from "#state";
import { clearSectionSaveStatus, reportSectionSaveStatus } from "#state";

export const SaveStatusHostContext = createContext<boolean>(false);

/** Is an aggregate save-status host mounted above this section? */
export function useSaveStatusHosted(): boolean {
  return use(SaveStatusHostContext);
}

/** Report one settings section's save lifecycle to the aggregate host. Reporting is an EFFECT (a store
 *  write during render is a tearing hazard) and is cleared on unmount so a pane swap can't leave a ghost
 *  "saving" in the footer. */
export function useReportSaveStatus(id: string, state: SaveLifecycleState): void {
  useEffect((): (() => void) => {
    reportSectionSaveStatus(id, state);
    return (): void => clearSectionSaveStatus(id);
  }, [id, state]);
}
