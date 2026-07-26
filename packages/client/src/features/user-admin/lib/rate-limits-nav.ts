// The Rate-limits admin-section nav entry (Phase B ③) — the ONE `SettingsSubcategory` shared by the
// contribution def (rate-limits-section def) and the section's `<Section>` anchor stamp; split out so
// neither imports the other (the memory-settings-section-nav precedent).

import type { SettingsSubcategory } from "#state";

export const RATE_LIMITS_SUBCATEGORY: SettingsSubcategory = {
  id: "rate-limits",
  label: "Rate limits",
  keywords: ["rate", "limit", "throttle", "requests", "login", "brute", "cap", "abuse"],
};
