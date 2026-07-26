// The System-tuning admin-SECTION CONTRIBUTION (Phase B ⑩ / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry at the `admin` anchor. user-admin owns it (it owns the admin pane).

import type { SettingsSectionContribution } from "#state";
import { SystemTuningSection } from "../components/system-tuning-section";
import { SYSTEM_TUNING_SUBCATEGORY } from "./system-tuning-nav";

export const systemTuningSection: SettingsSectionContribution = {
  id: "admin-system-tuning",
  anchor: "admin",
  nav: SYSTEM_TUNING_SUBCATEGORY,
  body: () => <SystemTuningSection />,
};
