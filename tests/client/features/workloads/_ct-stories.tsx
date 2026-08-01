// workloads feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — WorkloadsSettingsSurface/BackupSettingsSurface are mounted by SettingsShell itself, not
// exported standalone.

import { useOrbSocket } from "@orb/client/data";
import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import type { ReactElement, ReactNode } from "react";
import { WorkloadsTuningSection } from "../../../../packages/client/src/features/workloads/components/workloads-tuning-section";
import { BackupSettingsSurface } from "../../../../packages/client/src/features/workloads/surfaces/backup-settings-surface";
import { WorkloadsSettingsSurface } from "../../../../packages/client/src/features/workloads/surfaces/workloads-settings-surface";
import { CtDataProviders, CtSettingsSectionRegistry } from "../../../support/ct/ct-data-providers";

// The tuning section has its OWN story/CT below; this jobs-surface story mounts with zero contributions
// (the seam's empty case — byte-identical to the pre-seam pane). The surface reads the section registry
// from CONTEXT now (SET-SEAMS §5.2), so the empty case is an empty registry PROVIDED, not a prop.
const emptyWorkloadsSections = createContributorRegistry<SettingsSectionContribution>("ct-empty-workloads-sections", []);

/** The app-root shape: ONE socket, above every room hook. Since SSE-1 S5 an active workload row has no
 *  subscription of its own — it JOINS a `workloads` ROOM on the tab's one socket, so the socket has to be
 *  mounted above the pane for any live tail to exist at all (`routes/app-root.tsx` does this for real). */
function SocketHost({ children }: { readonly children: ReactNode }): ReactElement {
  useOrbSocket();
  return <>{children}</>;
}

/** The real Workloads settings pane (the per-user jobs surface) in isolation — `workloads.list`,
 *  `sessions.me` (the viewer's role for the owner-only bulk affordances + the cross-owner view),
 *  `admin.listUsers` (owner∪admin only — the gated handle map / target picker), the workload verbs,
 *  and the per-row live tail are stubbed per-test via routeTrpc + routeOrbSocket. */
export function WorkloadsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <CtSettingsSectionRegistry sections={emptyWorkloadsSections}>
          <div style={{ height: 900, overflow: "auto", width: 960 }}>
            <WorkloadsSettingsSurface />
          </div>
        </CtSettingsSectionRegistry>
      </SocketHost>
    </CtDataProviders>
  );
}

/** The Workloads analysis-tuning SECTION (Phase B ⑤) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("workloads") stubbed in the `.ct.tsx`. Proves the analysis-knob write path. */
export function WorkloadsTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 640, padding: 16 }}>
        <WorkloadsTuningSection sectionId="workloads-tuning" />
      </div>
    </CtDataProviders>
  );
}

/** The real Backup & Restore pane (the export/import portability surface) in isolation — the export half
 *  needs no network (checkboxes + a browser download href); the import half POSTs `/api/import/bundle`
 *  (routed per-test) and tails the import workload's ROOM on the one socket (routeOrbSocket per-test). */
export function BackupSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <BackupSettingsSurface />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}
