// The Databank settings-section nav entry (Phase B ④) — the ONE `SettingsSubcategory` shared by the
// contribution def (databank-settings-section.tsx) and the section surface's `<Section>` anchor stamp; split
// out so neither imports the other (the memory-settings-section-nav precedent).

import type { SettingsSubcategory } from "#state";

export const DATABANK_SETTINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "databank",
  label: "Databank",
  keywords: ["databank", "documents", "retrieval", "rag", "chunks", "rerank", "knowledge"],
};
