// The RENDER half of the settings-section save-status seam (SET-SEAMS §3, S3) — the ONE component a
// self-owned settings section renders instead of a bare `<AutosaveStatus>`.
//
// S3: status is REPORTED by the section and RENDERED once by the host; RETRY stays local. A decomposed pane
// stacks N sections; N stacked footers is smear, and no footer at all regresses the honest "Saved · Synced
// across your devices." affordance. So this component covers BOTH arms and a section body never branches on
// hosting:
//   HOSTED   — report into the transient store (the shell renders the ONE aggregate footer) and render
//              inline ONLY in `error`, so the failing section is locatable at its own anchor with its own
//              retry (D41: surface the failure where it happened; the aggregate never retries). `blocked`
//              (a held write) deliberately does NOT get an inline arm: its locality is already carried by
//              the invalid FIELD's own error, and a second inline line saying the same thing is the stacked
//              smear this seam exists to prevent. The aggregate footer states it and offers the jump.
//   DEGRADED — no aggregate host mounted (a pane not yet migrated, a CT story): render inline in every
//              state, exactly as before the seam existed.
//
// Tier: `#forms` is tier 3 and both the settings shell and every contributing feature are tier 5, so both
// may import it; the store it writes holds plain enums in `#state` (forms → state is the legal direction).

import type { ReactElement } from "react";
import type { SaveLifecycleState } from "#state";
import { AutosaveStatus } from "./autosave-status.tsx";
import { useReportSaveStatus, useSaveStatusHosted } from "./save-status-seam.ts";

export interface SectionSaveStatusProps {
  /** The reporting section's registry id (`SettingsSectionContribution.id`) — the key the aggregate footer
   *  and the nav error marker locate the section by. */
  readonly id: string;
  readonly state: SaveLifecycleState;
  /** Re-run the pending save — the section's OWN retry (an autosave session's `retrySave`). */
  readonly onRetry: () => void;
  /** The `saved`-state reassurance line, rendered only in the degraded (unhosted) arm — the hosted arm's
   *  reassurance is the shell's one aggregate footer. */
  readonly caption?: string | undefined;
}

/** The section-level save readout: reports always, renders per §3's two arms. */
export function SectionSaveStatus({ id, state, onRetry, caption }: SectionSaveStatusProps): ReactElement | null {
  const hosted = useSaveStatusHosted();
  useReportSaveStatus(id, state);
  if (hosted && state !== "error") {
    return null;
  }
  // Conditional spread, not `caption={caption}` — `AutosaveStatus.caption` is a genuinely absent-or-string
  // prop under exactOptionalPropertyTypes.
  return <AutosaveStatus state={state} onRetry={onRetry} {...(caption === undefined ? {} : { caption })} />;
}
