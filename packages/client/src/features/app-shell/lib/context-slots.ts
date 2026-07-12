// CONTEXT_SLOTS — the registry-as-data for the CONTEXT panel's per-section TAB strip (UI-Arch §4.1;
// the same §11.5 registry-pairing species as RAIL_SLOTS / MODAL_SLOTS). The array IS the panel: a
// section's context tabs are data entries (id + label), NOT bespoke JSX, so a future domain (rpg/crew
// — rpg-design/11 §1, chat-crew-design/07) adds a context tab by APPENDING a registry entry + a body,
// never by touching the domain-agnostic shell. The generic `<ContextTabsPanel>` (../components) reads
// this table for the active section and pairs each entry's `id` with a ROUTE-injected body ReactNode
// (the `MODAL_SLOTS` ⋈ `AppShellProps.modals` seam — the shell forwards ReactNode slots, never
// importing a feature). The tab `id`s ride the SAME loose `#state` `contextTab` seam (string-keyed,
// shared across sections — only ONE section's context ever renders, so ids never collide at runtime).
//
// PARKED CONSUMER — chat: the `chats` key is DELIBERATELY absent. The chat lane keeps its DIRECT
// `SectionSlot.context` mount (`<ChatContextPanel>` — its own internal Tabs), owner-parked; migrating it
// onto this registry is a separate chat-lane task. The founding — and today ONLY — consumer is the
// `characters` section (FINAL-Character §7).

import type { SectionId } from "#state";

/** One CONTEXT-panel tab entry (id-paired with a route-injected body). Closable-within-artifact
 *  disclosure, NEVER navigation (§7): the panel's collapse is the PanelChrome, the tab is content. */
export interface ContextTabEntry {
  /** The tab key — also the `#state` `contextTab` seam value the shell selects on. */
  readonly id: string;
  /** The visible tab label (sentence-case; §13 voice). */
  readonly label: string;
}

/** The per-section CONTEXT tab strip, in render order. A section with no entry falls back to the
 *  shell's own CONTEXT placeholder (an unregistered section is not a bug — it simply has no tabbed
 *  context). Keyed by `SectionId` (a typo is a `tsc` error), Partial (most sections register none). */
export const CONTEXT_SLOTS: Partial<Record<SectionId, readonly ContextTabEntry[]>> = {
  // FINAL-Character §7 — the relationship ledger + config. Activity is the default (first) tab. The
  // Actions menu is NOT a tab (it is the persistent options menu ABOVE the strip — the panel's
  // `actions` slot, wired at the route). Appearance's §8.1 theme cluster is Wave 4 (Trust-only today).
  characters: [
    { id: "activity", label: "Activity" },
    { id: "appearance", label: "Appearance" },
    { id: "relations", label: "Relations" },
    { id: "history", label: "History" },
  ],
  // The Assembly (BUILD-SPEC §3.1) — the rack section INSPECTOR (Section tab, default/first) + the
  // preset usage/bindings panel (Usage tab). Selecting a rack row docks CONTEXT open on Section; the
  // shell's own placeholder shows when nothing is selected (the route passes `undefined`).
  presets: [
    { id: "section", label: "Section" },
    { id: "usage", label: "Usage" },
  ],
};
