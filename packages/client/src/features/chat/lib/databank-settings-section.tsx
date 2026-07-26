// The Databank settings-SECTION CONTRIBUTION (Phase B ④ / client-architecture-lockdown.md §6c) — the
// co-located definition the chat feature exports on its front door; the composition root (main.tsx)
// assembles it into the chat-behavior pane's settings-section registry (G8) at the `chat-behavior` anchor.
// Chat owns the {{databank}} slot's consumption (the gather op), so it lands here — never features/settings.

import type { SettingsSectionContribution } from "#state";
import { DatabankSettingsSection } from "../components/databank-settings-section";
import { DATABANK_SETTINGS_SUBCATEGORY } from "./databank-settings-section-nav";

export const databankSettingsSection: SettingsSectionContribution = {
  id: "chat-databank",
  anchor: "chat-behavior",
  nav: DATABANK_SETTINGS_SUBCATEGORY,
  body: () => <DatabankSettingsSection />,
};
