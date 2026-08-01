// The Engines section's nav entry (SET-SEAMS stage 3) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other.
// The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).

import type { SettingsSubcategory } from "#state";

export const ADMIN_ENGINES_SUBCATEGORY: SettingsSubcategory = {
  id: "engines",
  label: "Engines",
  keywords: ["vllm", "gpu", "inference", "restart", "supervisor", "health"],
  settings: [
    {
      id: "engine-restart",
      label: "Restart an engine",
      keywords: ["vllm", "bounce", "hung", "failed", "embed", "rerank"],
    },
  ],
};
