// The Engines section's nav entry (SET-SEAMS stage 3) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section body's `<Section>` anchor stamp; split out so neither imports the other.
// The `(anchor, subId)` pair is byte-identical to the pre-split pane's own subcategory (§7.1).

import type { ConfigSubcategory } from "#state";

export const ADMIN_ENGINES_SUBCATEGORY: ConfigSubcategory = {
  id: "engines",
  label: "Engines",
  keywords: ["vllm", "gpu", "inference", "restart", "supervisor", "health"],
  teach: {
    summary: "Local inference engine health and restart controls. Bounce a hung vLLM process or check embedding and rerank engine status.",
    affects: ["local engine availability, briefly, during a restart"],
  },
  settings: [
    {
      id: "engine-restart",
      label: "Restart an engine",
      keywords: ["vllm", "bounce", "hung", "failed", "embed", "rerank"],
      teach: {
        summary: "Bounce a local inference engine that hung or failed \u2014 embeddings, rerank and the rest report their health here.",
        affects: ["that engine's in-flight work, briefly"],
      },
    },
  ],
};
