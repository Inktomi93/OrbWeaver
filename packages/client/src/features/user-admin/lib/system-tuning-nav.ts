// The System-tuning admin-section nav entry (Phase B ⑩) — the ONE `SettingsSubcategory` shared by the
// contribution def and the section's `<Section>` anchor stamp; split out so neither imports the other (the
// rate-limits-section-nav precedent).

import type { SettingsSubcategory } from "#state";

export const SYSTEM_TUNING_SUBCATEGORY: SettingsSubcategory = {
  id: "system-tuning",
  label: "System tuning",
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
  ],
};
