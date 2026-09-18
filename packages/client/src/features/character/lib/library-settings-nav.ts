// The Library settings-section nav entry (⑪, D107) — the ONE `ConfigSubcategory` shared by the
// contribution def (library-settings-section.tsx) and the section body's `<Section>` anchor stamp; split
// out so neither imports the other (the world-info-settings-nav / chat-behavior-nav precedent).

import type { ConfigSubcategory } from "#state";

export const LIBRARY_SETTINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "library",
  label: "Library",
  keywords: ["library", "pagination", "page size", "rows"],
  teach: {
    summary: "Character library display settings: how many rows each page shows.",
    affects: ["the character library's pagination, on this account"],
  },
  settings: [
    {
      id: "rows-per-page",
      label: "Rows per page",
      keywords: ["pagination", "page", "size", "limit"],
      teach: { summary: "How many characters one library page shows.", affects: ["the character library's pagination only"] },
    },
  ],
};
