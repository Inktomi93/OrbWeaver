// The Library settings-section nav entry (⑪, D107) — the ONE `SettingsSubcategory` shared by the
// contribution def (library-settings-section.tsx) and the section body's `<Section>` anchor stamp; split
// out so neither imports the other (the world-info-settings-nav / chat-behavior-nav precedent).

import type { SettingsSubcategory } from "#state";

export const LIBRARY_SETTINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "library",
  label: "Library",
  keywords: ["library", "pagination", "page size", "rows"],
  settings: [{ id: "rows-per-page", label: "Rows per page", keywords: ["pagination", "page", "size", "limit"] }],
};
