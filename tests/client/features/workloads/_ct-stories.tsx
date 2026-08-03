// workloads feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — the section bodies and BackupSettingsSurface are mounted by the settings host, not exported
// standalone.

import { useOrbSocket } from "@orb/client/data";
import { SettingsShell } from "@orb/client/features/settings";
import { openSettingsTo } from "@orb/client/state";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { SchedulesSection } from "../../../../packages/client/src/features/workloads/components/schedules-section.tsx";
import { WorkloadsJobsSection } from "../../../../packages/client/src/features/workloads/components/workloads-jobs-section.tsx";
import { WorkloadsTuningSection } from "../../../../packages/client/src/features/workloads/components/workloads-tuning-section.tsx";
import { BackupSettingsSurface } from "../../../../packages/client/src/features/workloads/surfaces/backup-settings-surface.tsx";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers.tsx";

/** The app-root shape: ONE socket, above every room hook. Since SSE-1 S5 an active workload row has no
 *  subscription of its own — it JOINS a `workloads` ROOM on the tab's one socket, so the socket has to be
 *  mounted above any surface that shows live rows (`routes/app-root.tsx` does this for real). */
function SocketHost({ children }: { readonly children: ReactNode }): ReactElement {
  useOrbSocket();
  return <>{children}</>;
}

/** The Jobs SECTION (SET-SEAMS stage 3) in isolation — `workloads.list`, `sessions.me` (the viewer's role
 *  for the owner-only bulk affordances + the cross-owner view), `admin.listUsers` (owner∪admin only — the
 *  gated handle map / target picker), the workload verbs, and the per-row live tail are stubbed per-test via
 *  routeTrpc + routeOrbSocket. The section owns its own suspense boundary now. */
export function WorkloadsJobsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <WorkloadsJobsSection />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

/** The Schedules SECTION (SET-SEAMS stage 3) in isolation — `workloads.listSchedules`, `sessions.me`, the
 *  gated `admin.listUsers` handle map, and the schedule verbs are stubbed per-test via routeTrpc. No socket:
 *  a schedule row has no live tail (only an ACTIVE run does). */
export function WorkloadsSchedulesSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <SchedulesSection />
      </div>
    </CtDataProviders>
  );
}

/** The REAL workloads pane, driven through the shell — the ONLY way to mount it since SET-SEAMS stage 3 made
 *  it a `{kind:"sections"}` skimmer with no surface of its own. Deep-linked (the shell's default active
 *  category is `appearance`) so it lands cold on workloads with the REAL door-ordered section registry and
 *  the derived nav — the production path. A tall/wide box: the pane stacks three sections. */
export function WorkloadsPaneStory(): ReactElement {
  useState(() => {
    openSettingsTo("workloads");
    return null;
  });
  return (
    <CtDataProviders>
      <SocketHost>
        <CtRealSectionRegistry>
          <div style={{ height: 900, width: 1160 }}>
            <SettingsShell />
          </div>
        </CtRealSectionRegistry>
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
