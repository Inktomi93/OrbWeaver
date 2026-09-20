// The System-tuning admin-SECTION CONTRIBUTION (Phase B ⑩ / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry at the `admin` anchor. user-admin owns it (it owns the admin pane).

import type { ConfigSectionContribution } from "#state";
import { SystemTuningSection } from "../components/system-tuning-section.tsx";
import { SYSTEM_TUNING_SUBCATEGORY } from "./system-tuning-nav.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "admin-system-tuning";

export const systemTuningSection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "admin",
  nav: SYSTEM_TUNING_SUBCATEGORY,
  owns: {
    tier: "app",
    keys: ["agentSdkConcurrency", "promptTransformDeadlineMs", "catalogRefreshIntervalMs", "imageVariantQuality", "maxDatabankBytes", "promptCacheMinDepth"],
  },
  body: () => <SystemTuningSection sectionId={SECTION_ID} />,
};
