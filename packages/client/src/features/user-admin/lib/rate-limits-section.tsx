// The Rate-limits admin-SECTION CONTRIBUTION (Phase B ③ / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry (G8) at the `admin` anchor. user-admin owns it (it owns the admin pane).

import type { SettingsSectionContribution } from "#state";
import { RateLimitsSection } from "../components/rate-limits-section";
import { RATE_LIMITS_SUBCATEGORY } from "./rate-limits-nav";

export const rateLimitsSection: SettingsSectionContribution = {
  id: "admin-rate-limits",
  anchor: "admin",
  nav: RATE_LIMITS_SUBCATEGORY,
  body: () => <RateLimitsSection />,
};
