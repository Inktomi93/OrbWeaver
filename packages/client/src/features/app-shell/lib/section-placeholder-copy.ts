// SECTION_PLACEHOLDER_COPY — the one home for each rail section's honest "not built yet" placeholder
// copy, keyed by SectionId as a Record so a new section is a tsc error until it declares copy. Every
// SectionId must carry a distinct (title, description) pair — a gate enforces it. chats/characters carry
// copy too even though they're always route-composed with real content, for Record completeness.

import type { SectionId } from "#state";

/** One section's placeholder copy — title + a single sentence naming what will live here. */
export interface SectionPlaceholderCopy {
  readonly title: string;
  readonly description: string;
}

export const SECTION_PLACEHOLDER_COPY: Record<SectionId, SectionPlaceholderCopy> = {
  chats: {
    title: "Chats",
    description: "Your conversations live here — pick a thread on the left, or start a new one.",
  },
  characters: {
    title: "Characters",
    description: "Your cast lives here — browse the list, then open someone to see their card.",
  },
  presets: {
    title: "Presets",
    description:
      "Your generation presets live here — pick one to tune sampling, reasoning, and prompts.",
  },
  worldInfo: {
    title: "World Info",
    description:
      "Your world books live here — pick one to edit its keyword-triggered lore and where it attaches.",
  },
  corpus: {
    title: "Corpus",
    description: "Search across every thread, character, and scene — the web, searchable.",
  },
  refinery: {
    title: "Refinery",
    description: "Score → rewrite → analyze a character card without drifting from your original.",
  },
  analytics: {
    title: "Analytics",
    description: "Charts over your corpus land here — cast time, thread connections, drift.",
  },
};
