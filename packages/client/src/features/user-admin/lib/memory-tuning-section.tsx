// The Memory-tuning admin-SECTION CONTRIBUTION (Phase B ③ / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry (G8) at the `admin` anchor. Covers AppSettings.memoryDefaults +
// memorySummarizer (admin-tier config → user-admin owns it).

import type { SettingsSectionContribution } from "#state";
import { MemoryTuningSection } from "../components/memory-tuning-section";
import { MEMORY_TUNING_SUBCATEGORY } from "./memory-tuning-nav";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "admin-memory-tuning";

export const memoryTuningSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "admin",
  nav: MEMORY_TUNING_SUBCATEGORY,
  owns: { tier: "app", keys: ["memoryDefaults", "memorySummarizer"] },
  body: () => <MemoryTuningSection sectionId={SECTION_ID} />,
};
