// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// settings shell comes through the feature front door, wrapped in the real data layer (`routeTrpc` stubs
// `settings.getUserSettings` so the Appearance pane resolves; the placeholder panes need no network).

import { SettingsShell, ThemePickerSurface } from "@orb/client/features/settings";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
// The story reaches a feature internal the front door doesn't re-export (the app-shell _ct-stories.tsx
// Rail precedent) — AppearanceSettingsSurface + SystemSettingsSurface are mounted by SettingsShell itself,
// not exported standalone.
import { AppearanceSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/appearance-settings-surface";
import { ChatBehaviorSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/chat-behavior-settings-surface";
import { RegexSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/regex-settings-surface";
import { SystemSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/system-settings-surface";
import { TagsSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/tags-settings-surface";
// shell.css (the `.shell-modal-header` chrome) is loaded transitively by globals.css, but import it
// directly so the modal-chrome story below has the header/divider styles even in isolation.
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers";

/** The full-bleed settings shell in a fixed-height box + the real data layer (network stubbed per-test).
 *  SettingsShell reads `useSettingsPaneRegistry()`, so it must mount under the pane-registry provider —
 *  CtRealSectionRegistry nests it (mirrors main.tsx's door). */
export function SettingsShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 560, width: 900 }}>
          <SettingsShell />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The settings shell inside the REAL modal chrome (a faithful mirror of ModalHost's `DialogModal`: the
 *  `xl` DialogPopup, the `.shell-modal-header` + its divider, and the scroll-body div) — so the CT can
 *  measure the header→content gap and the divider width against the true modal content box. */
export function SettingsModalStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
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
      </CtRealSectionRegistry>
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

/** The real Chat-behavior pane (PD-146) in isolation — `getUserSettings` (read) and
 *  `updateUserSettingsSection("chat")` (the autosave write) are stubbed per-test via routeTrpc. */
export function ChatBehaviorSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <ChatBehaviorSettingsSurface />
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
