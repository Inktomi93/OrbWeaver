// user-admin feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// story reaches a feature internal the front door doesn't re-export (AdminSettingsSurface is mounted by
// SettingsShell itself, not exported standalone) — the settings _ct-stories.tsx precedent.

import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { MemoryTuningSection } from "../../../../packages/client/src/features/user-admin/components/memory-tuning-section";
import { RateLimitsSection } from "../../../../packages/client/src/features/user-admin/components/rate-limits-section";
import { SystemTuningSection } from "../../../../packages/client/src/features/user-admin/components/system-tuning-section";
import { AdminSettingsSurface } from "../../../../packages/client/src/features/user-admin/surfaces/admin-settings-surface";
import { CtDataProviders, CtSettingsSectionRegistry } from "../../../support/ct/ct-data-providers";

// This story pins the Users + Engines built sections; the AppSettings admin-tier sections get their own
// stories below (the seam's empty-contributions case here — byte-identical to the pre-seam pane). The
// surface reads the section registry from CONTEXT now (SET-SEAMS §5.2), so "empty" is a provided registry.
const emptyAdminSections = createContributorRegistry<SettingsSectionContribution>("ct-empty-admin-sections", []);

/** The real Admin settings pane (the Users + Engines sections) in isolation — `admin.listUsers`,
 *  `sessions.me` (the viewer's role for the owner-only role controls), `admin.vllmEngines`, and the
 *  row-verb mutations are stubbed per-test via routeTrpc. TooltipProvider for the menu chrome. */
export function AdminSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtSettingsSectionRegistry sections={emptyAdminSections}>
        <TooltipProvider>
          <div style={{ height: 900, overflow: "auto", width: 960 }}>
            <AdminSettingsSurface />
          </div>
        </TooltipProvider>
      </CtSettingsSectionRegistry>
    </CtDataProviders>
  );
}

/** The Rate limits admin SECTION (Phase B ③) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function RateLimitsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <RateLimitsSection sectionId="admin-rate-limits" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Memory tuning admin SECTION (Phase B ③) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function MemoryTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <MemoryTuningSection sectionId="admin-memory-tuning" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The System tuning admin SECTION (Phase B ⑩) in isolation — getAppSettingsWithOverrides +
 *  updateAppSettings stubbed per-test. */
export function SystemTuningSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ padding: 16, width: 720 }}>
          <SystemTuningSection sectionId="admin-system-tuning" />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}
