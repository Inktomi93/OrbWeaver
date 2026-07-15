// user-admin feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// story reaches a feature internal the front door doesn't re-export (AdminSettingsSurface is mounted by
// SettingsShell itself, not exported standalone) — the settings _ct-stories.tsx precedent.

import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { AdminSettingsSurface } from "../../../../packages/client/src/features/user-admin/surfaces/admin-settings-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The real Admin settings pane (the Users + Engines sections) in isolation — `admin.listUsers`,
 *  `sessions.me` (the viewer's role for the owner-only role controls), `admin.vllmEngines`, and the
 *  row-verb mutations are stubbed per-test via routeTrpc. TooltipProvider for the menu chrome. */
export function AdminSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <AdminSettingsSurface />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}
