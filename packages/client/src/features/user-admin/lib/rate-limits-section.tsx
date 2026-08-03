// The Rate-limits admin-SECTION CONTRIBUTION (Phase B ③ / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry (G8) at the `admin` anchor. user-admin owns it (it owns the admin pane).

import type { SettingsSectionContribution } from "#state";
import { RateLimitsSection } from "../components/rate-limits-section.tsx";
import { RATE_LIMITS_SUBCATEGORY } from "./rate-limits-nav.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "admin-rate-limits";

export const rateLimitsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "admin",
  nav: RATE_LIMITS_SUBCATEGORY,
  owns: { tier: "app", keys: ["rateLimits"] },
  body: () => <RateLimitsSection sectionId={SECTION_ID} />,
};
