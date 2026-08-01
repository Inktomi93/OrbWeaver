// The World Info rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. A pure DATA object: no app-shell/auth hook (the LIST's mobile-sheet-close on select is a #state
// intent, `selectWorldBookFromList`, not an isMobile branch here). CONTEXT is the `single` arm (§6b) —
// worldInfo has one body, not tabs. The composition root assembles this into the section registry
// (main.tsx); AppShell consumes it via `useSectionRegistry`.

import { BookOpen } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { selectWorldBookFromList } from "#state";
import { WorldInfoLibraryAnchor } from "../anchors/world-info-library-anchor";
import { WorldInfoContent } from "../components/world-info-content";
import { WorldInfoContextBody } from "../components/world-info-context-body";
import { WorldInfoListHeader } from "../components/world-info-list-header";
import { WorldInfoLibrarySurface } from "../surfaces/world-info-library-surface";

export const worldInfoSection: SectionDefinition = {
  id: "worldInfo",
  rail: { label: "World Info", icon: BookOpen, group: "authoring", mobile: "sheet" },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: {
    title: "World Info",
    description: "Your world books live here — pick one to edit its keyword-triggered lore and where it attaches.",
  },
  list: () => (
    <WorldInfoLibraryAnchor>
      <WorldInfoLibrarySurface onSelectBook={selectWorldBookFromList} />
    </WorldInfoLibraryAnchor>
  ),
  // The LIST chrome-band content (D66 A1/A2 — the L4 sweep): "WORLD INFO" + count + the ONE primary New.
  listHeader: () => <WorldInfoListHeader />,
  content: () => <WorldInfoContent />,
  // The book activation panel — one body, shown once a book is open (no book = nothing to attach yet).
  context: { kind: "single", body: () => <WorldInfoContextBody /> },
};
