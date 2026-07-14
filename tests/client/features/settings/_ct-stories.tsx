// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// settings shell comes through the feature front door, wrapped in the real data layer (`routeTrpc` stubs
// `settings.getUserSettings` so the Appearance pane resolves; the placeholder panes need no network).

import {
  ImportOnboardingCard,
  SettingsShell,
  ThemePickerSurface,
} from "@orb/client/features/settings";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
// The story reaches a feature internal the front door doesn't re-export (the app-shell _ct-stories.tsx
// Rail precedent) — AppearanceSettingsSurface + SystemSettingsSurface are mounted by SettingsShell itself,
// not exported standalone.
import { AdminSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/admin-settings-surface";
import { AppearanceSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/appearance-settings-surface";
import { BackupSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/backup-settings-surface";
import { RegexSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/regex-settings-surface";
import { SystemSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/system-settings-surface";
import { TagsSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/tags-settings-surface";
import { WorkloadsSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/workloads-settings-surface";
// shell.css (the `.shell-modal-header` chrome) is loaded transitively by globals.css, but import it
// directly so the modal-chrome story below has the header/divider styles even in isolation.
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The full-bleed settings shell in a fixed-height box + the real data layer (network stubbed per-test). */
export function SettingsShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 560, width: 900 }}>
        <SettingsShell />
      </div>
    </CtDataProviders>
  );
}

/** The settings shell inside the REAL modal chrome (a faithful mirror of ModalHost's `DialogModal`: the
 *  `xl` DialogPopup, the `.shell-modal-header` + its divider, and the scroll-body div) — so the CT can
 *  measure the header→content gap and the divider width against the true modal content box. */
export function SettingsModalStory(): ReactElement {
  return (
    <CtDataProviders>
      <Dialog open={true}>
        <DialogPopup size="xl">
          <header className="shell-modal-header shrink-0">
            <DialogTitle>Settings</DialogTitle>
            <DialogClose
              render={
                <button aria-label="Close" type="button">
                  ×
                </button>
              }
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsShell />
          </div>
        </DialogPopup>
      </Dialog>
    </CtDataProviders>
  );
}

/** The real theme picker/library (D44 §12.1) — wrapped in the data layer (its `listThemes` +
 *  `getUserSettings` reads are stubbed per-test via routeTrpc) + TooltipProvider for the row chrome. */
export function ThemePickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ width: 560 }}>
          <ThemePickerSurface />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

/** The real appearance settings pane (D44 §12.1 #31) in isolation — `getUserSettings` (read) and
 *  `updateUserSettingsSection` (the autosave write) are stubbed per-test via routeTrpc. A tall scrolling
 *  box: the surface stacks many sections and would clip in a short fixed box. */
export function AppearanceSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <AppearanceSettingsSurface />
      </div>
    </CtDataProviders>
  );
}

/** The real Regex settings pane (owner-global scripts) in isolation — `getUserSettings` (read) and
 *  `updateUserSettingsSection("regex")` (the autosave write) are stubbed per-test via routeTrpc. */
export function RegexSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 560, overflow: "auto", width: 720 }}>
        <RegexSettingsSurface />
      </div>
    </CtDataProviders>
  );
}

/** The appearance pane at a NARROW container width (a phone-width settings modal) — proves the horizontal
 *  row grammar's fixed ~200px control column can't starve the label block to 0 (the Wave-1 in-flow-squeeze
 *  class); it stacks the row so the label keeps full width. */
export function AppearanceSettingsNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 300 }}>
        <AppearanceSettingsSurface />
      </div>
    </CtDataProviders>
  );
}

/** The real System settings pane (Task #37 — the APP-tier AppSettings home) in isolation — `getAppSettings`
 *  (the resolved effective config), `sessions.me` (the viewer's role for the D17 owner-gate), and
 *  `updateAppSettings` (the delta-autosave write) are stubbed per-test via routeTrpc. */
export function SystemSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <SystemSettingsSurface />
      </div>
    </CtDataProviders>
  );
}

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

/** The real Workloads settings pane (the per-user jobs surface) in isolation — `workloads.list`,
 *  `sessions.me` (the viewer's role for the owner-only bulk affordances + the cross-owner view),
 *  `admin.listUsers` (owner∪admin only — the gated handle map / target picker), the workload verbs,
 *  and the `workloads.subscribe` SSE tail are stubbed per-test via routeTrpc + a local SSE route. */
export function WorkloadsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <WorkloadsSettingsSurface />
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

/** The first-run import onboarding card in isolation — reads `chat.listChats` (stubbed per-test; empty ⇒
 *  fresh ⇒ the card shows). Its Upload action deep-links to Settings → Backup & Restore via the shell
 *  store; the dismiss is device-local (localStorage). */
export function ImportOnboardingCardStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <ImportOnboardingCard />
      </div>
    </CtDataProviders>
  );
}

/** The same card in a 375px-wide box — below the card's `@md` container width, so its text+button Row must
 *  collapse to a column (heading wraps as normal lines, buttons stack BELOW the text, no horizontal overflow). */
export function ImportOnboardingCardNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 375 }}>
        <ImportOnboardingCard />
      </div>
    </CtDataProviders>
  );
}

/** The real Tags settings pane (Task #65 — the tag-management screen) in isolation — `tag.listTagsWithUsage`
 *  (the read) plus the tag mutations (`updateTag`/`removeTag`/`mergeTags`/`setTagOrder`/`pruneUnusedTags`)
 *  are stubbed per-test via routeTrpc. */
export function TagsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <TagsSettingsSurface />
      </div>
    </CtDataProviders>
  );
}
