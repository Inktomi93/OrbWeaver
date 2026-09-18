// The Memory settings-section nav entry (Phase B ①) — the ONE `ConfigSubcategory` shared by the
// contribution def (memory-settings-section.tsx in lib) and the section surface's `<Section>` anchor stamp;
// split out so neither has to import the other (the chat-behavior-nav precedent).

import type { ConfigSubcategory } from "#state";

export const MEMORY_SETTINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "memory",
  label: "Memory",
  keywords: ["memory", "remember", "recall", "long", "digest", "history"],
  teach: {
    summary: "Per-chat memory: how the model recalls earlier conversation, digest depth and summarization behavior.",
    affects: ["long-term recall quality and context usage in this chat"],
  },
};
