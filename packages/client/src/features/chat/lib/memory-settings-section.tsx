// The Memory settings-SECTION CONTRIBUTION (Phase B ① / client-architecture-lockdown.md §6c) — the
// co-located definition the chat feature exports on its front door; the composition root (main.tsx)
// assembles it into the chat-behavior pane's settings-section registry (G8). The chat/memory subsystem OWNS
// this section, so it lands here instead of growing the config host (pain-point §7).

import type { ConfigSectionContribution } from "#state";
import { MemorySettingsSection } from "../components/memory-settings-section.tsx";
import { MEMORY_SETTINGS_SUBCATEGORY } from "./memory-settings-section-nav.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "chat-memory";

export const memorySettingsSection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: MEMORY_SETTINGS_SUBCATEGORY,
  // The whole `memory` namespace is this one switch (S1: the patch names only `enabled`).
  owns: { tier: "user", section: "memory", keys: ["enabled"] },
  body: () => <MemorySettingsSection sectionId={SECTION_ID} />,
};
