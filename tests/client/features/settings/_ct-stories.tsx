// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// settings shell comes through the feature front door, wrapped in the real data layer (`routeTrpc` stubs
// `settings.getUserSettings` so the Appearance pane resolves; the placeholder panes need no network).

import { SettingsShell, ThemePickerSurface } from "@orb/client/features/settings";
import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsCategoryId, SettingsSectionContribution } from "@orb/client/state";
import { openSettingsTo } from "@orb/client/state";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
// The story reaches a feature internal the front door doesn't re-export (the app-shell _ct-stories.tsx
// Rail precedent) — SystemSettingsSurface and friends are mounted by SettingsShell itself, not exported
// standalone.
import { ChatBehaviorSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/chat-behavior-settings-surface";
import { RegexSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/regex-settings-surface";
import { SystemSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/system-settings-surface";
import { TagsSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/tags-settings-surface";
// shell.css (the `.shell-modal-header` chrome) is loaded transitively by globals.css, but import it
// directly so the modal-chrome story below has the header/divider styles even in isolation.
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import { CtDataProviders, CtRealSectionRegistry, CtSettingsSectionRegistry } from "../../../support/ct/ct-data-providers";

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

/** The shell with a deep-link target seeded BEFORE first render (the `openSettingsTo` seam). The lazy
 *  useState initializer runs exactly once, synchronously, so `useSettingsTarget()` reads the target on the
 *  first render — reproducing a cold `__orb.nav.openSettings(target)` where the sessions.me probe is still in
 *  flight. Pair with a DELAYED viewer stub in the `.ct.tsx` to exercise the when-gated-pane deep-link race.
 *  `subId` exercises the SUB-level deep link (SET-SEAMS §10 Q4): the pane resolves in render, the jump to
 *  `settingsAnchorId(target, subId)` lands once the pane's DOM has the anchor. */
export function SettingsShellDeepLinkStory({ target, subId }: { readonly target: SettingsCategoryId; readonly subId?: string }): ReactElement {
  useState(() => {
    openSettingsTo(target, subId);
    return null;
  });
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

// The contributed-sections seam is exercised by its OWN stories (memory ①, world-info ②, library ⑪, and
// the seven decomposed appearance sections); the chat-behavior story below pins that pane's native fields,
// so it mounts with zero contributions (the door's empty case — byte-identical to the pre-seam pane).
const emptySettingsSections = createContributorRegistry<SettingsSectionContribution>("ct-empty-settings-sections", []);

/** The REAL appearance pane, driven through the shell — the ONLY way to mount it since SET-SEAMS stage 1
 *  made it a `{kind:"sections"}` skimmer with no surface of its own. `appearance` is the shell's default
 *  active category, so this lands on it cold, with the REAL door-ordered section registry, the shell's
 *  aggregate save-status footer (`SaveStatusHostContext`) and the derived nav — the production path.
 *  A tall/wide box: the pane stacks eight sections and would clip in a short one. */
export function AppearancePaneStory(): ReactElement {
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

/** The real Chat-behavior pane (PD-146) in isolation — `getUserSettings` (read) and
 *  `updateUserSettingsSection("chat")` (the autosave write) are stubbed per-test via routeTrpc. */
export function ChatBehaviorSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtSettingsSectionRegistry sections={emptySettingsSections}>
        <div style={{ height: 900, overflow: "auto", width: 960 }}>
          <ChatBehaviorSettingsSurface />
        </div>
      </CtSettingsSectionRegistry>
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
