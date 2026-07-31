// The Library settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c) — the co-located
// definition the character feature exports on its front door; the composition root (main.tsx) assembles it
// into the appearance pane's settings-section registry (G8). Character OWNS this knob (`library.pageSize` is
// read by character-library-surface), so it lands here instead of staying inside features/settings.

import type { SettingsSectionContribution } from "#state";
import { LibrarySettingsSection } from "../components/library-settings-section";
import { LIBRARY_SETTINGS_SUBCATEGORY } from "./library-settings-nav";

export const librarySettingsSection: SettingsSectionContribution = {
  id: "library-settings",
  anchor: "appearance",
  nav: LIBRARY_SETTINGS_SUBCATEGORY,
  body: () => <LibrarySettingsSection />,
};
