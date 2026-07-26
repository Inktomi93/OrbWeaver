// workloads feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — WorkloadsSettingsSurface/BackupSettingsSurface are mounted by SettingsShell itself, not
// exported standalone.

import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import type { ReactElement } from "react";
import { WorkloadsTuningSection } from "../../../../packages/client/src/features/workloads/components/workloads-tuning-section";
import { BackupSettingsSurface } from "../../../../packages/client/src/features/workloads/surfaces/backup-settings-surface";
import { WorkloadsSettingsSurface } from "../../../../packages/client/src/features/workloads/surfaces/workloads-settings-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

// The tuning section has its OWN story/CT below; this jobs-surface story mounts with zero contributions
// (the seam's empty case — byte-identical to the pre-seam pane).
const emptyWorkloadsSections = createContributorRegistry<SettingsSectionContribution>("ct-empty-workloads-sections", []);

/** The real Workloads settings pane (the per-user jobs surface) in isolation — `workloads.list`,
 *  `sessions.me` (the viewer's role for the owner-only bulk affordances + the cross-owner view),
 *  `admin.listUsers` (owner∪admin only — the gated handle map / target picker), the workload verbs,
 *  and the `workloads.subscribe` SSE tail are stubbed per-test via routeTrpc + a local SSE route. */
export function WorkloadsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <WorkloadsSettingsSurface sectionContributors={emptyWorkloadsSections} />
      </div>
    </CtDataProviders>
  );
}

/** The Workloads analysis-tuning SECTION (Phase B ⑤) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("workloads") stubbed in the `.ct.tsx`. Proves the analysis-knob write path. */
export function WorkloadsTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 640, padding: 16 }}>
        <WorkloadsTuningSection />
      </div>
    </CtDataProviders>
  );
}

/** The real Backup & Restore pane (the export/import portability surface) in isolation — the export half
 *  needs no network (checkboxes + a browser download href); the import half POSTs `/api/import/bundle`
 *  (routed per-test) and tails `workloads.subscribe` (a local SSE route per-test). */
export function BackupSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <BackupSettingsSurface />
      </div>
    </CtDataProviders>
  );
}
