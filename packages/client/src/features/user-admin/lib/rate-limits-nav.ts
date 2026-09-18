// The Rate-limits admin-section nav entry (Phase B ③) — the ONE `ConfigSubcategory` shared by the
// contribution def (rate-limits-section def) and the section's `<Section>` anchor stamp; split out so
// neither imports the other (the memory-settings-section-nav precedent).

import type { ConfigSubcategory } from "#state";

export const RATE_LIMITS_SUBCATEGORY: ConfigSubcategory = {
  id: "rate-limits",
  label: "Rate limits",
  keywords: ["rate", "limit", "throttle", "requests", "login", "brute", "cap", "abuse"],
  teach: {
    summary: "Request throttling and login-attempt caps that protect the deployment from abuse and brute-force attacks.",
    affects: ["request throughput and sign-in security, deployment-wide"],
  },
};
