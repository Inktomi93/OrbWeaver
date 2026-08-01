// regex feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The story
// reaches a feature internal the front door doesn't re-export (the settings/workloads _ct-stories.tsx
// precedent) — RegexSettingsSurface is mounted by the settings host through `regexPane`, not exported
// standalone.

import type { ReactElement } from "react";
import { RegexSettingsSurface } from "../../../../packages/client/src/features/regex/surfaces/regex-settings-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

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
