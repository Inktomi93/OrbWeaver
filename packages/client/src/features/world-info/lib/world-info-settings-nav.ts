// The World-info settings-section nav entry (Phase B ②) — the ONE `SettingsSubcategory` shared by the
// contribution def (world-info-settings-section.tsx) and the surface's `<Section>` anchor stamp; split out
// so neither imports the other (the chat-behavior-nav / memory-settings-section-nav precedent).

import type { SettingsSubcategory } from "#state";

export const WORLD_INFO_SETTINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "world-info",
  label: "World info",
  keywords: ["world", "info", "lore", "scan", "depth", "budget", "tokens", "entries"],
};
