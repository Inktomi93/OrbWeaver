// The Workloads-tuning settings-section nav entry (Phase B ⑤) — the ONE `ConfigSubcategory` shared by the
// contribution def (workloads-tuning-section.tsx) and the section surface's `<Section>` anchor stamp; split
// out so neither imports the other (the memory-settings-section-nav precedent).

import type { ConfigSubcategory } from "#state";

export const WORKLOADS_TUNING_SUBCATEGORY: ConfigSubcategory = {
  id: "tuning",
  label: "Analysis tuning",
  keywords: ["tuning", "duplicates", "threshold", "themes", "clusters", "cooccurrence", "hub", "pairs", "analysis"],
  teach: {
    summary: "Thresholds for the corpus analysis jobs: duplicate detection sensitivity, theme-cluster granularity and co-occurrence pair limits.",
    affects: ["discovery analysis quality and compute cost when analysis jobs run"],
  },
};
