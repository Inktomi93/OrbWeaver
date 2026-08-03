// The World-info settings-SECTION CONTRIBUTION (Phase B ② / client-architecture-lockdown.md §6c) — the
// co-located definition the world-info feature exports on its front door; the composition root (main.tsx)
// assembles it into the chat-behavior pane's settings-section registry (G8). World-info OWNS this section,
// so it lands here instead of growing features/settings (pain-point §7).

import type { SettingsSectionContribution } from "#state";
import { WorldInfoSettingsSection } from "../components/world-info-settings-section.tsx";
import { WORLD_INFO_SETTINGS_SUBCATEGORY } from "./world-info-settings-nav.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "world-info-settings";

export const worldInfoSettingsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: WORLD_INFO_SETTINGS_SUBCATEGORY,
  owns: { tier: "user", section: "worldInfo", keys: ["scanDepth", "tokenBudget"] },
  body: () => <WorldInfoSettingsSection sectionId={SECTION_ID} />,
};
