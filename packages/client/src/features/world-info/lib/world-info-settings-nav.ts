// The World-info settings-section nav entry (Phase B ②) — the ONE `ConfigSubcategory` shared by the
// contribution def (world-info-settings-section.tsx) and the surface's `<Section>` anchor stamp; split out
// so neither imports the other (the chat-behavior-nav / memory-settings-section-nav precedent).

import type { ConfigSubcategory } from "#state";

export const WORLD_INFO_SETTINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "world-info",
  label: "World info",
  keywords: ["world", "info", "lore", "scan", "depth", "budget", "tokens", "entries"],
  teach: {
    summary:
      "How far back world-info keywords are matched, and how many tokens of matched entries one turn may carry. A token budget of 0 means no limit. In a shared room, the host's values apply.",
    affects: ["how much lore the model receives in the chats you host"],
  },
};
