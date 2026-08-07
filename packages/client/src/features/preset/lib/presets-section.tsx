// The Presets rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. The composition root assembles this into the section registry (main.tsx); AppShell consumes it
// via `useSectionRegistry`.
//
// CONTEXT is `kind: "single"` (preset-surface-redesign.md §7, owner decision D2). It was two tabs — a
// section INSPECTOR that rented editing (deleted: one object, one place, §5.2) and a Usage placeholder
// (folded into the readout's own copy until per-chat bindings exist). What stands is ONE readout that
// projects by the active editor VIEW, which is why it cannot be a tabs mint: a tabs context resolves to
// NOTHING when no entity is selected, and the no-selection panel — the ACTIVE preset's effective profile
// — is a first-class arm of this readout, not an empty state (§7's table, row 1).

import { SlidersHorizontal } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { presetSectionSelection, selectPresetFromList } from "#state";
import { PresetLibraryAnchor } from "../anchors/preset-library-anchor.tsx";
import { PresetContent } from "../components/preset-content.tsx";
import { PresetListHeader } from "../components/preset-list-header.tsx";
import { PresetReadout } from "../components/readout/preset-readout.tsx";
import { PresetReadoutHeader } from "../components/readout/preset-readout-header.tsx";
import { PresetLibrarySurface } from "../surfaces/preset-library-surface.tsx";

export const presetsSection: SectionDefinition = {
  id: "presets",
  rail: { label: "Presets", icon: SlidersHorizontal, group: "authoring", mobile: "sheet" },
  // BOTH docked at boot (crunch-list O-19★, owner ruling): the library IS how you pick what you are
  // editing, and the readout IS the product — a Presets section that opens with neither pane looks
  // unbuilt. The persisted per-panel override still wins thereafter.
  panelDefaults: { list: "docked", context: "docked" },
  placeholder: {
    title: "Presets",
    description: "Your generation presets live here — pick one to tune sampling, reasoning, and prompts.",
  },
  list: () => (
    <PresetLibraryAnchor>
      <PresetLibrarySurface onSelectPreset={selectPresetFromList} />
    </PresetLibraryAnchor>
  ),
  // The LIST chrome-band content (D66 A1/A2 — the L4 sweep): "PRESETS" + count + the create verbs.
  listHeader: () => <PresetListHeader />,
  // How the SHELL reads "is a preset open?" — the mobile ONE-SHELL rule's input + its back affordance.
  selection: presetSectionSelection,
  content: () => <PresetContent />,
  // ONE readout, projected by the active editor view (§7) — read-only + navigation-only. The BAND names
  // that projection (crunch item 11): a pane whose content swaps per view cannot be titled "Details".
  context: { kind: "single", body: () => <PresetReadout />, header: () => <PresetReadoutHeader /> },
};
