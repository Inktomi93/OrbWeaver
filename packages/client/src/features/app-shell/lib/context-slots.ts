// CONTEXT_SLOTS — the registry-as-data for the context panel's per-section tab strip. A section's
// context tabs are data entries (id + label), not bespoke JSX, so a new domain adds a tab by appending a
// registry entry + a body, never touching the domain-agnostic shell. <ContextTabsPanel> reads this table
// for the active section and pairs each entry's id with a route-injected body ReactNode.
//
// `chats` is deliberately absent — the chat lane keeps its direct SectionSlot.context mount
// (<ChatContextPanel>, its own internal Tabs); migrating it onto this registry is a separate task.

import type { SectionId } from "#state";

/** One context-panel tab entry (id-paired with a route-injected body). */
export interface ContextTabEntry {
  readonly id: string;
  readonly label: string;
}

/** The per-section context tab strip, in render order. A section with no entry falls back to the shell's own context placeholder. */
export const CONTEXT_SLOTS: Partial<Record<SectionId, readonly ContextTabEntry[]>> = {
  characters: [
    { id: "field", label: "Field" },
    { id: "links", label: "Links" },
    { id: "options", label: "Options" },
  ],
  presets: [
    { id: "section", label: "Section" },
    { id: "usage", label: "Usage" },
  ],
  corpus: [
    { id: "archetypes", label: "Archetypes" },
    { id: "visuals", label: "Visuals" },
    { id: "map", label: "Map" },
    { id: "similarity", label: "Similarity" },
    { id: "compare", label: "Compare" },
  ],
  analytics: [
    { id: "models", label: "Models" },
    { id: "time", label: "Time" },
    { id: "personas", label: "Personas" },
  ],
};
