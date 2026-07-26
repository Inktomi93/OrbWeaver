// The World-info settings-SECTION CONTRIBUTION (Phase B ② / client-architecture-lockdown.md §6c) — the
// co-located definition the world-info feature exports on its front door; the composition root (main.tsx)
// assembles it into the chat-behavior pane's settings-section registry (G8). World-info OWNS this section,
// so it lands here instead of growing features/settings (pain-point §7).

import type { SettingsSectionContribution } from "#state";
import { WorldInfoSettingsSection } from "../components/world-info-settings-section";
import { WORLD_INFO_SETTINGS_SUBCATEGORY } from "./world-info-settings-nav";

export const worldInfoSettingsSection: SettingsSectionContribution = {
  id: "world-info-settings",
  anchor: "chat-behavior",
  nav: WORLD_INFO_SETTINGS_SUBCATEGORY,
  body: () => <WorldInfoSettingsSection />,
};
