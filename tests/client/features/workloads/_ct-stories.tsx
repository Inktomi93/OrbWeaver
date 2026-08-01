// workloads feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — the section bodies and BackupSettingsSurface are mounted by the settings host, not exported
// standalone.

import { SettingsShell } from "@orb/client/features/settings";
import { openSettingsTo } from "@orb/client/state";
import type { ReactElement } from "react";
import { useState } from "react";
import { SchedulesSection } from "../../../../packages/client/src/features/workloads/components/schedules-section";
import { WorkloadsJobsSection } from "../../../../packages/client/src/features/workloads/components/workloads-jobs-section";
import { WorkloadsTuningSection } from "../../../../packages/client/src/features/workloads/components/workloads-tuning-section";
import { BackupSettingsSurface } from "../../../../packages/client/src/features/workloads/surfaces/backup-settings-surface";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers";

/** The Jobs SECTION (SET-SEAMS stage 3) in isolation — `workloads.list`, `sessions.me` (the viewer's role
 *  for the owner-only bulk affordances + the cross-owner view), `admin.listUsers` (owner∪admin only — the
 *  gated handle map / target picker), the workload verbs, and the `workloads.subscribe` SSE tail are stubbed
 *  per-test via routeTrpc + a local SSE route. The section owns its own suspense boundary now. */
export function WorkloadsJobsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <WorkloadsJobsSection />
      </div>
    </CtDataProviders>
  );
}

/** The Schedules SECTION (SET-SEAMS stage 3) in isolation — `workloads.listSchedules`, `sessions.me`, the
 *  gated `admin.listUsers` handle map, and the schedule verbs are stubbed per-test via routeTrpc. */
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
      <CtRealSectionRegistry>
        <div style={{ height: 900, width: 1160 }}>
          <SettingsShell />
        </div>
      </CtRealSectionRegistry>
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
