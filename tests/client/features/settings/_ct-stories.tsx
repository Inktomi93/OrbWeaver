// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// settings shell comes through the feature front door, wrapped in the real data layer (`routeTrpc` stubs
// `settings.getUserSettings` so the Appearance pane resolves; the placeholder panes need no network).

import { SettingsShell, ThemePickerSurface } from "@orb/client/features/settings";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
// The story reaches a feature internal the front door doesn't re-export (the app-shell _ct-stories.tsx
// Rail precedent) — AppearanceSettingsSurface is mounted by SettingsShell itself, not exported standalone.
import { AppearanceSettingsSurface } from "../../../../packages/client/src/features/settings/surfaces/appearance-settings-surface";
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
 *  box: the surface's `Grid cols="wide"` tiles many sections and would clip in a short fixed box. */
export function AppearanceSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <AppearanceSettingsSurface />
      </div>
    </CtDataProviders>
  );
}
