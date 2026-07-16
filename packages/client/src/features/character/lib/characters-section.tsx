// The Characters rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. CONTEXT is minted via `defineContextTabs` (§6b): `useCharacterContextState` pairs with the tabs
// so `S` (CharacterContextState) never crosses the shell seam. `makeCharactersSection` takes the
// character-DETAIL contributor registry (§6c) so the crew feature can graft card-evolution review sections
// into the editor body at the door WITHOUT importing character (crew 07-client-ui §4.2 — the ONE named
// seam gap). The composition root assembles this into the section registry (main.tsx); AppShell consumes
// it via `useSectionRegistry`.

import { Users } from "@orb/ui/icons";
import type { CharacterContextState, CharacterDetailContribution, ContributorRegistry } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { CharacterLibraryAnchor } from "../anchors/character-library-anchor";
import { CharacterActionsMenu } from "../components/character-actions-menu";
import { CharacterContent } from "../components/character-content";
import { CharacterFacetInspector } from "../components/character-facet-inspector";
import { CharacterOptionsTab } from "../components/character-options-tab";
import { CharacterRelationsTab } from "../components/character-relations-tab";
import { useCharacterContextState } from "../hooks/use-character-context-state";
import { CharacterLibrarySurface } from "../surfaces/character-library-surface";

export function makeCharactersSection(detailContributors: ContributorRegistry<CharacterDetailContribution>): SectionDefinition {
  return {
    id: "characters",
    rail: { label: "Characters", icon: Users, group: "primary", mobile: "tab" },
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
    content: () => <CharacterContent detailContributors={detailContributors} />,
    // Three tabs: Field (drilled facet detail), Links (world books + personas), Options.
    context: defineContextTabs<CharacterContextState>({
      useContextState: useCharacterContextState,
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
      actions: (s) => <CharacterActionsMenu characterId={s.characterId} />,
    }),
  };
}
