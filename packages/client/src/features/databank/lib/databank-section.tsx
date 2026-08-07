// The Databank rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, list band, content, and CONTEXT model in
// one place. The composition root assembles it into the section registry (main.tsx); AppShell consumes it
// through `useSectionRegistry`.
//
// D-0 — WHY A RAIL SECTION AND NOT A CONFIG COLLECTION (owner-ruled 2026-08-01; the question is OPEN and
// cheap either way, so the argument is recorded here rather than left to be re-derived):
//   The owner ruled Arm A — the documents library is its own rail destination. The spec's Arm B (fold into
//   World Info as one "Knowledge" section) was rejected because it needs a family-contribution seam that
//   does not exist and because the two families' per-chat behavior genuinely differs today (world-info's
//   chat scope is deferred at transport; databank's is fully built, with host authority + the D85
//   visibility override).
//   THE TREE HAS SINCE MOVED UNDER THAT RULING, and the counter-argument deserves to be findable: config-
//   rail R2 DEMOTED World Info from a rail section to a `CollectionContribution`, stating
//   (`features/world-info/lib/world-info-collection.tsx`) that "a books LIBRARY is workspace anatomy, not a
//   top-level destination". By the spec's own §3.1 table this library is that library's shape. What Arm A
//   buys, concretely, is the band: this pane owns a search input, a create PRIMARY and the owner-wide
//   maintenance kebab (D-6), none of which a collection's group band has a slot for. Demoting later is one
//   file plus a `RETIRED_SECTION_HEAL` row — exactly the move R2 already made — so nothing here is a
//   one-way door.
//
// `icon: Database`: the stacked store — the documents are a corpus you keep, and the glyph is the one the
// mock draws. Distinct from `Library` (Corpus, the analytics browser) and `BookOpen` (world-info books).
//
// `panelDefaults` — LIST docked (the library IS how you pick what you are reading) and CONTEXT collapsed
// (the activation panel is a per-document follow-up, not the reason you came), the world-info posture.
//
// `mobile: "sheet"` — reached through You, like every other authoring section; the four-tab bottom bar is a
// curation and it is already full.

import { Database } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { databankSectionSelection } from "#state";
import { DatabankLibraryAnchor } from "../anchors/databank-library-anchor.tsx";
import { DatabankContextBody, DatabankContextHeader } from "../components/databank-context-body.tsx";
import { DatabankListHeader } from "../components/databank-list-header.tsx";
import { DatabankDetailSurface } from "../surfaces/databank-detail-surface.tsx";
import { DatabankLibrarySurface } from "../surfaces/databank-library-surface.tsx";
import { DATABANK_CONTEXT_EMPTY } from "./databank-copy.ts";
import { useDatabankSelectionTitle } from "./databank-selection-title.ts";

export const databankSection: SectionDefinition = {
  id: "databank",
  rail: { label: "Databank", icon: Database, group: "authoring", mobile: "sheet" },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: {
    title: "Databank",
    description: "Files, pages and pasted text you index once — the passages that matter get pulled into your chats as they happen.",
  },
  list: () => (
    <DatabankLibraryAnchor>
      <DatabankLibrarySurface />
    </DatabankLibraryAnchor>
  ),
  // The LIST chrome-band content (D66 A1/A2): "DATABANK" + count + Add + the maintenance kebab.
  listHeader: () => <DatabankListHeader />,
  // How the SHELL reads "is a document open?" — the mobile ONE-SHELL rule's input + its back affordance.
  selection: databankSectionSelection,
  // …and what it calls the open document in the pushed frame's topbar.
  useSelectionTitle: useDatabankSelectionTitle,
  content: () => <DatabankDetailSurface />,
  // ONE activation body (the world-info posture): where the open document fires, plus the pointer to the
  // retrieval knobs. `empty` names what the pane WILL show — never the generic "Details / select something"
  // filler (side-eye F-12).
  //
  // `header` names the pane's SUBJECT (`library.html`'s CONTEXT band: "Document"). Without it the band fell
  // back to the shell's neutral "Details" — which named nothing over three arms that answer where a document
  // FEEDS, and collided with the CONTENT pane's own "Details" group heading ~950px to the left: the same
  // generic-band defect the config workspace was swept for (side-eye 2026-08-03 P3).
  context: { kind: "single", body: () => <DatabankContextBody />, header: () => <DatabankContextHeader />, empty: DATABANK_CONTEXT_EMPTY },
};
