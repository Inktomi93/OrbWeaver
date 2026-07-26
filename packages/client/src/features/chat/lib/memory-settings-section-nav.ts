// The Memory settings-section nav entry (Phase B ①) — the ONE `SettingsSubcategory` shared by the
// contribution def (memory-settings-section.tsx in lib) and the section surface's `<Section>` anchor stamp;
// split out so neither has to import the other (the chat-behavior-nav precedent).

import type { SettingsSubcategory } from "#state";

export const MEMORY_SETTINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "memory",
  label: "Memory",
  keywords: ["memory", "remember", "recall", "long", "digest", "history"],
};
