// user-admin feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// stories reach feature internals the front door doesn't re-export (the section BODIES are mounted by the
// settings host through the contribution defs) — the settings _ct-stories.tsx precedent.

import { SettingsShell } from "@orb/client/features/settings";
import { openSettingsTo } from "@orb/client/state";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
import { AdminEnginesSection } from "../../../../packages/client/src/features/user-admin/components/admin-engines-section";
import { AdminCatalogSection, AdminEmbedCardSection } from "../../../../packages/client/src/features/user-admin/components/admin-ops-section";
import { AdminUsersSection } from "../../../../packages/client/src/features/user-admin/components/admin-users-section";
import { MemoryTuningSection } from "../../../../packages/client/src/features/user-admin/components/memory-tuning-section";
import { RateLimitsSection } from "../../../../packages/client/src/features/user-admin/components/rate-limits-section";
import { SystemTuningSection } from "../../../../packages/client/src/features/user-admin/components/system-tuning-section";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers";

/** The Users SECTION (SET-SEAMS stage 3) in isolation — `admin.listUsers` + `sessions.me` (the viewer's role
 *  for the owner-only role controls) and the row-verb mutations are stubbed per-test via routeTrpc. The
 *  section owns its own read + suspense boundary now. TooltipProvider for the row-menu chrome. */
export function AdminUsersSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <AdminUsersSection />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The Engines SECTION (SET-SEAMS stage 3) in isolation — the polled `admin.vllmEngines` read, the restart
 *  verb, and the launch-config editor's `settings.getAppSettings`/`updateAppSettings` are stubbed per-test. */
export function AdminEnginesSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <AdminEnginesSection />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The two ops SECTIONS (SET-SEAMS stage 3) — the catalog refreshers and the inline card embed, mounted
 *  together as the door renders them (adjacent at the admin anchor). Their verbs are stubbed per-test. */
export function AdminOpsSectionsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <AdminCatalogSection />
        <AdminEmbedCardSection />
      </div>
    </CtDataProviders>
  );
}

/** The REAL admin pane, driven through the shell — the ONLY way to mount it since SET-SEAMS stage 3 made it a
 *  `{kind:"sections"}` skimmer with no surface of its own. Deep-linked (the shell's default active category
 *  is `appearance`) so it lands cold on admin with the REAL door-ordered section registry and the derived
 *  nav — the production path. The pane is `when`-gated, so the `.ct.tsx` must stub an ADMIN viewer. */
export function AdminPaneStory(): ReactElement {
  useState(() => {
    openSettingsTo("admin");
    return null;
  });
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <TooltipProvider>
          <div style={{ height: 900, width: 1160 }}>
            <SettingsShell />
          </div>
        </TooltipProvider>
      </CtRealSectionRegistry>
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
