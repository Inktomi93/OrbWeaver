// Settings feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// settings shell comes through the feature front door, wrapped in the real data layer (`routeTrpc` stubs
// `settings.getUserSettings` so the Appearance pane resolves; the placeholder panes need no network).

import { SettingsShell, ThemePickerSurface } from "@orb/client/features/settings";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
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

/** The interim theme picker (J8) — pure render, no data layer; TooltipProvider so the deferred-row
 *  tooltips resolve their delay context (the shell normally provides it). */
export function ThemePickerStory(): ReactElement {
  return (
    <TooltipProvider>
      <div style={{ width: 480 }}>
        <ThemePickerSurface />
      </div>
    </TooltipProvider>
  );
}
