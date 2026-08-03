// The Library settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c) — the co-located
// definition the character feature exports on its front door; the composition root (main.tsx) assembles it
// into the appearance pane's settings-section registry (G8). Character OWNS this knob (`library.pageSize` is
// read by character-library-surface), so it lands here instead of staying inside features/settings.

import type { SettingsSectionContribution } from "#state";
import { LibrarySettingsSection } from "../components/library-settings-section.tsx";
import { LIBRARY_SETTINGS_SUBCATEGORY } from "./library-settings-nav.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "library-settings";

export const librarySettingsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "appearance",
  nav: LIBRARY_SETTINGS_SUBCATEGORY,
  owns: { tier: "user", section: "library", keys: ["pageSize"] },
  body: () => <LibrarySettingsSection sectionId={SECTION_ID} />,
};
