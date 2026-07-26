// user-admin feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// story reaches a feature internal the front door doesn't re-export (AdminSettingsSurface is mounted by
// SettingsShell itself, not exported standalone) — the settings _ct-stories.tsx precedent.

import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { MemoryTuningSection } from "../../../../packages/client/src/features/user-admin/components/memory-tuning-section";
import { RateLimitsSection } from "../../../../packages/client/src/features/user-admin/components/rate-limits-section";
import { AdminSettingsSurface } from "../../../../packages/client/src/features/user-admin/surfaces/admin-settings-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

// This story pins the Users + Engines built sections; the AppSettings admin-tier sections get their own
// stories below (the seam's empty-contributions case here — byte-identical to the pre-seam pane).
const emptyAdminSections = createContributorRegistry<SettingsSectionContribution>("ct-empty-admin-sections", []);

/** The real Admin settings pane (the Users + Engines sections) in isolation — `admin.listUsers`,
 *  `sessions.me` (the viewer's role for the owner-only role controls), `admin.vllmEngines`, and the
 *  row-verb mutations are stubbed per-test via routeTrpc. TooltipProvider for the menu chrome. */
export function AdminSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <AdminSettingsSurface sectionContributors={emptyAdminSections} />
        </div>
      </TooltipProvider>
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
          <RateLimitsSection />
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
          <MemoryTuningSection />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}
