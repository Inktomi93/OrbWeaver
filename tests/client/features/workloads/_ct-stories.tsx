// workloads feature CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — the section bodies are mounted by the config host, not exported standalone; the Backup group
// mounts as its two CONTRIBUTED sections through the host's own resolver.

import { useOrbSocket } from "@orb/client/data";
import { backupExportSection, backupImportSection } from "@orb/client/features/workloads";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution } from "@orb/client/state";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { BundleWorkloadTracker } from "../../../../packages/client/src/features/workloads/components/bundle-workload-tracker.tsx";
import { SchedulesSection } from "../../../../packages/client/src/features/workloads/components/schedules-section.tsx";
import { WorkloadsJobsSection } from "../../../../packages/client/src/features/workloads/components/workloads-jobs-section.tsx";
import { WorkloadsTuningSection } from "../../../../packages/client/src/features/workloads/components/workloads-tuning-section.tsx";
import type { LibraryImport } from "../../../../packages/client/src/features/workloads/hooks/use-library-import.ts";
import { useLibraryImport } from "../../../../packages/client/src/features/workloads/hooks/use-library-import.ts";
import { CtConfigGroupBody, CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { ConfigHostStory } from "../config/_ct-stories.tsx";

/** The Backup group's two contributed sections, assembled as at the door. */
const backupSections: ReturnType<typeof createContributorRegistry<ConfigSectionContribution>> = createContributorRegistry<ConfigSectionContribution>(
  "config-sections",
  [backupExportSection, backupImportSection],
);

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
export function WorkloadsGroupStory(): ReactElement {
  return (
    <ConfigHostStory target="workloads" height={900} width={1160}>
      <SocketHost>{null}</SocketHost>
    </ConfigHostStory>
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
          <CtConfigGroupBody anchor="backup" sections={backupSections} />
        </div>
      </SocketHost>
    </CtDataProviders>
  );
}

/** Direct hook driver for the request-ownership boundary. Production UI prevents a second ordinary pick
 *  while uploading; these buttons reproduce a programmatic overlap without faking the fetch seam.
 *
 *  A PICK AND A SEND ARE TWO ACTS since #1099 F36 (`stageFiles` → `confirm`), so the drivers stage and the
 *  CT presses "Confirm import" — which is the production sequence, not a test-only shortcut. */
function LibraryImportEpochBody(): ReactElement {
  const libraryImport = useLibraryImport();
  const [capturedSucceeded, setCapturedSucceeded] = useState<LibraryImport["track"]["onSucceeded"] | null>(null);
  const start = (name: "old" | "new"): void => {
    libraryImport.stageFiles([new File([name], `${name}.png`, { type: "image/png" })]);
  };
  const outcome = libraryImport.state.status === "done" ? (libraryImport.state.summary.outcomes[0]?.path ?? "done") : libraryImport.state.status;

  return (
    <>
      <button type="button" onClick={(): void => start("old")}>
        Import old batch
      </button>
      <button type="button" onClick={(): void => start("new")}>
        Import new batch
      </button>
      <button type="button" onClick={(): void => libraryImport.stageFiles([new File(["zip"], "old.zip", { type: "application/zip" })])}>
        Start old workload
      </button>
      <button type="button" onClick={libraryImport.confirm}>
        Confirm import
      </button>
      <button
        type="button"
        disabled={libraryImport.state.status !== "running"}
        onClick={(): void => setCapturedSucceeded(() => libraryImport.track.onSucceeded)}
      >
        Capture current workload
      </button>
      <button type="button" disabled={capturedSucceeded === null} onClick={(): void => capturedSucceeded?.({ imported: 9, skipped: 0, failed: 0, notes: [] })}>
        Complete captured workload
      </button>
      <button type="button" onClick={libraryImport.reset}>
        Reset import
      </button>
      <output data-testid="import-outcome">{outcome}</output>
    </>
  );
}

export function LibraryImportEpochStory(): ReactElement {
  return (
    <CtDataProviders>
      <LibraryImportEpochBody />
    </CtDataProviders>
  );
}

/** The two trackers of {@link BundleWorkloadTrackerStory}, with the tally the CT reads.
 *
 *  TWO, because one is the CONTROL. The claim under test is an ABSENCE — a torn-down tracker calls nothing
 *  — and an absence measured alone is indistinguishable from a scenario that never happened at all. The
 *  second tracker stays mounted on the SAME released response and the SAME retry ladder, so its counters
 *  moving is the proof that the first one's staying still is a guard rather than a dead test. */
function BundleTrackerPairBody({ goneId, liveId }: { readonly goneId: string; readonly liveId: string }): ReactElement {
  const [tailed, setTailed] = useState(true);
  const [gone, setGone] = useState({ progress: 0, succeeded: 0, failed: 0 });
  const [live, setLive] = useState({ progress: 0, succeeded: 0, failed: 0 });
  const tally = (counts: { progress: number; succeeded: number; failed: number }): string =>
    `${String(counts.progress)}/${String(counts.succeeded)}/${String(counts.failed)}`;
  return (
    <>
      {tailed ? (
        <BundleWorkloadTracker
          onFailed={(): void => setGone((c) => ({ ...c, failed: c.failed + 1 }))}
          onProgress={(): void => setGone((c) => ({ ...c, progress: c.progress + 1 }))}
          onSucceeded={(): void => setGone((c) => ({ ...c, succeeded: c.succeeded + 1 }))}
          workloadId={castId<WorkloadId>(goneId)}
        />
      ) : null}
      <BundleWorkloadTracker
        onFailed={(): void => setLive((c) => ({ ...c, failed: c.failed + 1 }))}
        onProgress={(): void => setLive((c) => ({ ...c, progress: c.progress + 1 }))}
        onSucceeded={(): void => setLive((c) => ({ ...c, succeeded: c.succeeded + 1 }))}
        workloadId={castId<WorkloadId>(liveId)}
      />
      <button type="button" onClick={(): void => setTailed(false)}>
        Unmount the tailed tracker
      </button>
      <output data-testid="tracker-tally">{`mounted=${String(tailed)} gone=${tally(gone)} live=${tally(live)}`}</output>
    </>
  );
}

/** #1601 — the FIRST mount of `<BundleWorkloadTracker>` in any test. It renders nothing, so it has no
 *  surface of its own to drive: the story supplies the two things a CT needs to see it at all — a boolean
 *  that unmounts one instance mid-flight, and a rendered tally of every callback it fired.
 *
 *  Under `SocketHost` because the tracker's tail is a ROOM on the tab's one socket, and the gap-heal edge
 *  it exists to serve (`onSocketLive` → `reconcile(0)`) only fires on a socket DROP AND RE-ATTACH — which
 *  is `routeOrbSocket`'s `dropFirstConnection`, never a first live edge (BOOT-4X). */
export function BundleWorkloadTrackerStory({ goneId, liveId }: { readonly goneId: string; readonly liveId: string }): ReactElement {
  return (
    <CtDataProviders>
      <SocketHost>
        <BundleTrackerPairBody goneId={goneId} liveId={liveId} />
      </SocketHost>
    </CtDataProviders>
  );
}
