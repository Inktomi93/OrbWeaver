// The Memory settings-SECTION CONTRIBUTION (Phase B ① / client-architecture-lockdown.md §6c) — the
// co-located definition the chat feature exports on its front door; the composition root (main.tsx)
// assembles it into the chat-behavior pane's settings-section registry (G8). The chat/memory subsystem OWNS
// this section, so it lands here instead of growing features/settings (pain-point §7).

import type { SettingsSectionContribution } from "#state";
import { MemorySettingsSection } from "../components/memory-settings-section";
import { MEMORY_SETTINGS_SUBCATEGORY } from "./memory-settings-section-nav";

export const memorySettingsSection: SettingsSectionContribution = {
  id: "chat-memory",
  anchor: "chat-behavior",
  nav: MEMORY_SETTINGS_SUBCATEGORY,
  body: () => <MemorySettingsSection />,
};
