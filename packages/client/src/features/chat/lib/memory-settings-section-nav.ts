// The Memory settings-section nav entry (Phase B ①) — the ONE `ConfigSubcategory` shared by the
// contribution def (memory-settings-section.tsx in lib) and the section surface's `<Section>` anchor stamp;
// split out so neither has to import the other (the chat-behavior-nav precedent).

import type { ConfigSubcategory } from "#state";

export const MEMORY_SETTINGS_SUBCATEGORY: ConfigSubcategory = {
  id: "memory",
  label: "Memory",
  keywords: ["memory", "remember", "recall", "long", "digest", "history", "summary", "utility"],
  teach: {
    summary:
      "One switch for your account: memory for every chat you host, off until you turn it on. It needs a Utility model, and while none is set its summaries wait.",
    affects: ["recall of earlier events in long chats you host", "extra summary calls on your Utility model"],
  },
};

/** What happens to a chat that already exists when Memory goes on: the build every reply runs covers its history. */
export const MEMORY_EXISTING_CHATS_NOTE = "A chat you already have builds its memory the next time it gets a reply.";
