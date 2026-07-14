// The Presets rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. A pure DATA object: every render slot is a hook-free arrow composing this feature's surfaces +
// components, so the definition itself imports NO app-shell/auth hook (the LIST's mobile-sheet-close on
// select and the CONTEXT reveal/dismiss intents live inside PresetContent / the #state actions). The
// composition root assembles this into the section registry (main.tsx); AppShell consumes it via
// `useSectionRegistry`. CONTEXT still rides the FLAG[lockdown-M3] bridge until M3.

import type { PresetId } from "@orb/kit/ids";
import { SlidersHorizontal } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { dismissPresetSection, selectPresetFromList } from "#state";
import { PresetLibraryAnchor } from "../anchors/preset-library-anchor";
import { PresetContent } from "../components/preset-content";
import { PresetSectionInspector } from "../components/preset-section-inspector";
import { PresetUsageContext } from "../components/preset-usage-context";
import { PresetLibrarySurface } from "../surfaces/preset-library-surface";

/** The Presets CONTEXT-panel state projection (O5 strict — a real named type, never void/any): the
 *  open preset every context tab drills into. */
interface PresetContextState {
  readonly presetId: PresetId;
}

export const presetsSection: SectionDefinition<PresetContextState> = {
  id: "presets",
  rail: { label: "Presets", icon: SlidersHorizontal, group: "authoring" },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: {
    title: "Presets",
    description:
      "Your generation presets live here — pick one to tune sampling, reasoning, and prompts.",
  },
  list: () => (
    <PresetLibraryAnchor>
      <PresetLibrarySurface onSelectPreset={selectPresetFromList} />
    </PresetLibraryAnchor>
  ),
  content: () => <PresetContent />,
  // Two tabs: Section (the rack row drilled into) and Usage (where the preset is bound).
  context: {
    kind: "tabs",
    tabs: [
      {
        id: "section",
        label: "Section",
        body: () => <PresetSectionInspector onDismiss={dismissPresetSection} />,
      },
      {
        id: "usage",
        label: "Usage",
        body: (s) => <PresetUsageContext presetId={s.presetId} />,
      },
    ],
  },
};
