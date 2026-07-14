// The Characters rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. A pure DATA object: every render slot is a hook-free arrow composing this feature's surfaces +
// components, so the definition itself imports NO app-shell/auth hook (the selection reads + the
// "reveal the field inspector" intent live inside CharacterContentSurface / the #state action).
// The composition root assembles this into the section registry (main.tsx); AppShell consumes it via
// `useSectionRegistry`. CONTEXT still rides the FLAG[lockdown-M3] bridge until M3.

import type { CharacterId } from "@orb/kit/ids";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the Users glyph fine (the character-card-facets.ts precedent).
import { Users } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { CharacterLibraryAnchor } from "../anchors/character-library-anchor";
import { CharacterContent } from "../components/character-content";
import { CharacterFacetInspector } from "../components/character-facet-inspector";
import { CharacterOptionsTab } from "../components/character-options-tab";
import { CharacterRelationsTab } from "../components/character-relations-tab";
import { CharacterLibrarySurface } from "../surfaces/character-library-surface";

/** The Characters CONTEXT-panel state projection (O5 strict — a real named type, never void/any): the
 *  selected character every context tab drills into. */
interface CharacterContextState {
  readonly characterId: CharacterId;
}

export const charactersSection: SectionDefinition<CharacterContextState> = {
  id: "characters",
  rail: { label: "Characters", icon: Users, group: "primary", mobilePrimary: true },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: {
    title: "Characters",
    description: "Your cast lives here — browse the list, then open someone to see their card.",
  },
  list: () => (
    <CharacterLibraryAnchor>
      <CharacterLibrarySurface />
    </CharacterLibraryAnchor>
  ),
  content: () => <CharacterContent />,
  // Three tabs: Field (drilled facet detail), Links (world books + personas), Options.
  context: {
    kind: "tabs",
    tabs: [
      {
        id: "field",
        label: "Field",
        body: (s) => <CharacterFacetInspector characterId={s.characterId} />,
      },
      {
        id: "links",
        label: "Links",
        body: (s) => <CharacterRelationsTab characterId={s.characterId} />,
      },
      {
        id: "options",
        label: "Options",
        body: (s) => <CharacterOptionsTab characterId={s.characterId} />,
      },
    ],
  },
};
