// The Memory-tuning admin-SECTION CONTRIBUTION (Phase B ③ / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry (G8) at the `admin` anchor. Covers AppSettings.memoryDefaults +
// memorySummarizer (admin-tier config → user-admin owns it).

import type { SettingsSectionContribution } from "#state";
import { MemoryTuningSection } from "../components/memory-tuning-section";
import { MEMORY_TUNING_SUBCATEGORY } from "./memory-tuning-nav";

export const memoryTuningSection: SettingsSectionContribution = {
  id: "admin-memory-tuning",
  anchor: "admin",
  nav: MEMORY_TUNING_SUBCATEGORY,
  body: () => <MemoryTuningSection />,
};
