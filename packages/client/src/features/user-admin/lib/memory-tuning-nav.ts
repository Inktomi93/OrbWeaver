// The Memory-tuning admin-section nav entry (Phase B ③) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section's `<Section>` anchor stamp; split out so neither imports the other.

import type { SettingsSubcategory } from "#state";

export const MEMORY_TUNING_SUBCATEGORY: SettingsSubcategory = {
  id: "memory-tuning",
  label: "Memory tuning",
  keywords: ["memory", "recall", "digest", "consolidation", "summarizer", "rerank", "vector", "tiering"],
};
