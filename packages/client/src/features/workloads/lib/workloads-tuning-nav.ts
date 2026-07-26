// The Workloads-tuning settings-section nav entry (Phase B ⑤) — the ONE `SettingsSubcategory` shared by the
// contribution def (workloads-tuning-section.tsx) and the section surface's `<Section>` anchor stamp; split
// out so neither imports the other (the memory-settings-section-nav precedent).

import type { SettingsSubcategory } from "#state";

export const WORKLOADS_TUNING_SUBCATEGORY: SettingsSubcategory = {
  id: "tuning",
  label: "Analysis tuning",
  keywords: ["tuning", "duplicates", "threshold", "themes", "clusters", "cooccurrence", "hub", "pairs", "analysis"],
};
