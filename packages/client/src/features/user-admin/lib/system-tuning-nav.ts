// The System-tuning admin-section nav entry (Phase B ⑩) — the ONE `ConfigSubcategory` shared by the
// contribution def and the section's `<Section>` anchor stamp; split out so neither imports the other (the
// rate-limits-section-nav precedent).

import type { ConfigSubcategory } from "#state";

export const SYSTEM_TUNING_SUBCATEGORY: ConfigSubcategory = {
  id: "system-tuning",
  label: "System tuning",
  teach: {
    summary: "Low-level deployment knobs: prompt-cache depth floor, summarize deadlines, transform budgets and catalog refresh intervals.",
    affects: ["cost, latency and cache behavior for the whole deployment"],
  },
  keywords: [
    "concurrency",
    "summarize",
    "deadline",
    "transform",
    "budget",
    "window",
    "catalog",
    "refresh",
    "image",
    "quality",
    "variant",
    "databank",
    "upload",
    "presence",
    "penalty",
    // The words an admin types when they are staring at a cache bill, not at this knob's own name.
    "cache",
    "prompt cache",
    "depth",
    "breakpoint",
    "anthropic",
    "claude",
  ],
  settings: [
    {
      id: "promptCacheMinDepth",
      label: "Prompt-cache depth floor",
      keywords: ["cache", "depth", "breakpoint", "anthropic", "claude", "cost"],
      teach: {
        summary: "The shallowest prompt depth a cache breakpoint may sit at \u2014 deeper floors trade cache hits for fewer billed cache writes.",
        affects: ["prompt-cache cost and hit rate on Anthropic connections"],
      },
    },
  ],
};
