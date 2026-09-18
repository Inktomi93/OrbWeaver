// The Memory-tuning admin-section nav entry (Phase B ③) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section's `<Section>` anchor stamp; split out so neither imports the other.

import type { ConfigSubcategory } from "#state";

export const MEMORY_TUNING_SUBCATEGORY: ConfigSubcategory = {
  id: "memory-tuning",
  label: "Memory tuning",
  keywords: ["memory", "recall", "digest", "consolidation", "summarizer", "rerank", "vector", "tiering"],
  teach: {
    summary: "Deployment-wide knobs for the memory pipeline: summarizer depth, consolidation thresholds, rerank weights and vector tiering.",
    affects: ["memory recall quality and compute cost, deployment-wide"],
  },
};
