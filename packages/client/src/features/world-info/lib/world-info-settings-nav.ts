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
      "Per-chat world-info behavior: scan depth, token budget and which lore books are active. Entries inject context the model reads when their keywords trigger.",
    affects: ["how much lore the model receives and when, in this chat"],
  },
};
