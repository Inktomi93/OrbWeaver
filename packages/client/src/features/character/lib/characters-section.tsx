// The Characters rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. CONTEXT is minted via `defineContextTabs` (§6b): `useCharacterContextState` pairs with the tabs
// so `S` (CharacterContextState) never crosses the shell seam. `makeCharactersSection` takes the
// character-DETAIL contributor registry (§6c) so the crew feature can graft card-evolution review sections
// into the editor body at the door WITHOUT importing character (crew 07-client-ui §4.2 — the ONE named
// seam gap). The composition root assembles this into the section registry (main.tsx); AppShell consumes
// it via `useSectionRegistry`.
//
// The SECOND door param is the chats PROJECTION body (list-pane-projection §3.2): chat-owned chat-row
// anatomy, hosted by this section's LIST pane. Same posture as the contributor registry — character never
// imports chat, chat never imports character, and `client-features-no-cross` keeps enforcing it.

import { Users } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { CharacterChatsProjectionView, CharacterContextState, CharacterDetailContribution, ContributorRegistry } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { CharacterLibraryAnchor } from "../anchors/character-library-anchor";
import { CharacterActionsMenu } from "../components/character-actions-menu";
import { CharacterContent } from "../components/character-content";
import { CharacterFacetInspector } from "../components/character-facet-inspector";
import { CharacterOptionsTab } from "../components/character-options-tab";
import { CharacterRelationsTab } from "../components/character-relations-tab";
import { CharactersListHeader } from "../components/characters-list-header";
import { CharactersListPane } from "../components/characters-list-pane";
import { useCharacterContextState } from "../hooks/use-character-context-state";

export function makeCharactersSection(
  detailContributors: ContributorRegistry<CharacterDetailContribution>,
  chatsProjection: (view: CharacterChatsProjectionView) => ReactNode,
): SectionDefinition {
  return {
    id: "characters",
    rail: { label: "Characters", icon: Users, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: "Characters",
      description: "Your cast lives here — browse the list, then open someone to see their card.",
    },
    // The MODAL pane (list-pane-projection Arm A): the picker while nothing is selected, HER CHATS the
    // moment a character is — the same slot, swapping on the section's own drill selection.
    list: () => (
      <CharacterLibraryAnchor>
        <CharactersListPane chatsProjection={chatsProjection} />
      </CharacterLibraryAnchor>
    ),
    // The band swaps with the pane (D9): `CHARACTERS` + create, or `‹ CHATS · <name>` + New chat.
    listHeader: () => <CharactersListHeader />,
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
