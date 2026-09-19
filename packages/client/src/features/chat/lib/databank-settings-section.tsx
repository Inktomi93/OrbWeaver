// The Databank settings-SECTION CONTRIBUTION (Phase B ④ / client-architecture-lockdown.md §6c) — the
// co-located definition the chat feature exports on its front door; the composition root (main.tsx)
// assembles it into the chat-behavior pane's settings-section registry (G8) at the `chat-behavior` anchor.
// Chat owns the {{databank}} slot's consumption (the gather op), so it lands here — never features/config.

import type { ConfigSectionContribution } from "#state";
import { DatabankSettingsSection } from "../components/databank-settings-section.tsx";
import { DATABANK_SETTINGS_SUBCATEGORY } from "./databank-settings-section-nav.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "chat-databank";

export const databankSettingsSection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: DATABANK_SETTINGS_SUBCATEGORY,
  // Claims at the TOP-level key: `retrieval`'s leaves (k/minScore/rerank) are this section's business.
  // `chunk` is deliberately NOT claimed — cited in UNCLAIMED_SETTINGS_KEYS (ingest-time params).
  owns: { tier: "user", section: "databank", keys: ["retrieval", "slotTokenBudget"] },
  body: () => <DatabankSettingsSection sectionId={SECTION_ID} />,
};
