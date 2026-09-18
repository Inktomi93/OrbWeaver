// The Databank settings-section nav entry (Phase B ④) — the ONE `ConfigSubcategory` shared by the
// contribution def (databank-settings-section.tsx) and the section surface's `<Section>` anchor stamp; split
// out so neither imports the other (the memory-settings-section-nav precedent).

import type { ConfigSubcategory } from "#state";

export const DATABANK_SETTINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "databank",
  label: "Databank",
  keywords: ["databank", "documents", "retrieval", "rag", "chunks", "rerank", "knowledge"],
  teach: {
    summary: "Per-chat document retrieval: attach files the model pulls from during a conversation, with chunking and reranking for relevant context.",
    affects: ["which documents the model can reference in this chat"],
  },
};
