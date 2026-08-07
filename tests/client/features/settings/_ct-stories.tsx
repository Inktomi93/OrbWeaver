// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// settings shell comes through the feature front door, wrapped in the real data layer (`routeTrpc` stubs
// `settings.getUserSettings` so the Appearance pane resolves; the placeholder panes need no network).

import { SettingsShell, ThemePickerSurface } from "@orb/client/features/settings";
import type { SettingsCategoryId } from "@orb/client/state";
import { openSettingsTo } from "@orb/client/state";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
// shell.css (the `.shell-modal-header` chrome) is loaded transitively by globals.css, but import it
// directly so the modal-chrome story below has the header/divider styles even in isolation.
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import { CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers.tsx";

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

/** The shell filling a PHONE viewport (pair with `test.use({ viewport: { width: 430, height: 740 } })` — the
 *  side-eye P0 receipt's device). Below the `@md` container step the shell is a push-detail flow: the nav
 *  list owns the whole pane until a section is selected. `position:fixed; inset:0` so the box IS the
 *  viewport (the harness body's 8px margin would otherwise push the pane off-screen and fake the defect). */
export function SettingsShellNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ position: "fixed", inset: 0 }}>
          <SettingsShell />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The shell in a box TALLER than the appearance pane's content, so the pane region does not scroll at all.
 *  A non-scrolling pane is simultaneously at its top and its bottom — the scroll-spy's bottom arm used to
 *  resolve it to the LAST section while the reader is looking at the first. */
export function SettingsShellFitsStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 4000, width: 1160 }}>
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

/** The picker in the NARROWEST REAL HOST — the `size="md"` settings dialog's inner content box at a 320px
 *  viewport, measured live at ~206px. The prior CT for this defect concluded a CT could not reproduce the
 *  clip; it was right about ITS mount, which was content-sized and simply grew to fit the over-wide band.
 *  A FIXED width is what makes the overflow real, and `overflow: visible` is what keeps it MEASURABLE
 *  (a hidden/clip container would swallow the very geometry the assertion reads). */
export function ThemePickerNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ width: 206, overflow: "visible" }} data-testid="theme-dialog-body">
          <ThemePickerSurface />
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}

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

/** The REAL chat-behavior pane, driven through the shell — the ONLY way to mount it since SET-SEAMS stage 2
 *  made it a `{kind:"sections"}` skimmer with no surface of its own. Deep-linked (the shell's default active
 *  category is `appearance`) so it lands cold on chat-behavior with the REAL door-ordered section registry,
 *  the shell's aggregate save-status footer (`SaveStatusHostContext`) and the derived nav — the production
 *  path. A tall/wide box: the pane stacks six sections and would clip in a short one. */
export function ChatBehaviorPaneStory(): ReactElement {
  useState(() => {
    openSettingsTo("chat-behavior");
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
