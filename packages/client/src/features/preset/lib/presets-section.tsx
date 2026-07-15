// The Presets rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. CONTEXT is minted via `defineContextTabs` (§6b): `usePresetContextState` pairs with the tabs so
// `S` (PresetContextState) never crosses the shell seam. The composition root assembles this into the
// section registry (main.tsx); AppShell consumes it via `useSectionRegistry`.

import { SlidersHorizontal } from "@orb/ui/icons";
import type { PresetContextState } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { dismissPresetSection, selectPresetFromList } from "#state";
import { PresetLibraryAnchor } from "../anchors/preset-library-anchor";
import { PresetContent } from "../components/preset-content";
import { PresetSectionInspector } from "../components/preset-section-inspector";
import { PresetUsageContext } from "../components/preset-usage-context";
import { usePresetContextState } from "../hooks/use-preset-context-state";
import { PresetLibrarySurface } from "../surfaces/preset-library-surface";

export const presetsSection: SectionDefinition = {
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
  context: defineContextTabs<PresetContextState>({
    useContextState: usePresetContextState,
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
  }),
};
