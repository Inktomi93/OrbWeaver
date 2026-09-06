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

import type { RefObject } from "react";
import { createContext, use, useEffect, useRef } from "react";
import type { SaveLifecycleState } from "#state";
import { clearSectionSaveStatus, reportSectionSaveStatus } from "#state";

export const SaveStatusHostContext = createContext<boolean>(false);

/** Is an aggregate save-status host mounted above this section? */
export function useSaveStatusHosted(): boolean {
  return use(SaveStatusHostContext);
}

/**
 * NO WRITE FROM THIS SUBTREE CAN LAND (#1716) — the second switch, and it is a CONTEXT for the same reason
 * the first one is: a section must know on its FIRST render, before the driver arms a debounce over an edit
 * that is going to be refused.
 *
 * It is deliberately spelled as "unwritable", not "the settings blob is corrupt": `#forms` is tier 3 and
 * knows nothing about versioned configs. The PROVIDER is where the domain fact lives — today the settings
 * pane (`settings.getUserSettings().configUnreadable`) and the preset editor
 * (`preset.get().configUnreadable`), both of which are reading the read-time twin of the server's
 * `stored_config_unreadable` refusal. Anything else that becomes structurally unwritable can mount the same
 * provider without teaching this file a second domain.
 *
 * Everything a `readOnly` mount disables, this disables too (the driver, the debounce, the crash-draft
 * mirror, the teardown flush) — but the STATUS differs, and that is the whole point: a read-only mount is
 * displaying someone else's row on purpose, while this one is a form the user may edit and whose edits can
 * never be persisted, which they are entitled to be told BEFORE they type.
 */
export const SaveUnwritableContext = createContext<boolean>(false);

/** Is every write from this subtree structurally refused? (`SaveUnwritableContext`). */
export function useSaveUnwritable(): boolean {
  return use(SaveUnwritableContext);
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

/**
 * `useSaveUnwritable`, as a REF a cleanup may read — the shape the autosave Session's teardown flush needs.
 *
 * Naming the boolean in that effect's dependency list would re-arm it whenever the flag flips, and every
 * re-arm of the teardown effect FLUSHES (the measured 31-write save loop its own comment warns about). A ref
 * written in an EFFECT — never during render (`react-hooks-refs-render-ban`) — is the one shape that lets a
 * cleanup read a current value without owning it as a dependency. Homed beside the context rather than in
 * the factory so the mechanism and its reason live together.
 */
export function useSaveUnwritableRef(): RefObject<boolean> {
  const unwritable = useSaveUnwritable();
  const ref = useRef(unwritable);
  useEffect((): void => {
    ref.current = unwritable;
  }, [unwritable]);
  return ref;
}
