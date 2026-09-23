// The Characters rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. CONTEXT is minted via `defineContextTabs` (§6b): `useCharacterContextState` pairs with the tabs
// so `S` (CharacterContextState) never crosses the shell seam. `makeCharactersSection` takes the
// character-DETAIL contributor registry (§6c) so the agents feature can graft card-evolution review sections
// into the editor body at the door WITHOUT importing character (crew 07-client-ui §4.2 — the ONE named
// seam gap). The composition root assembles this into the section registry (main.tsx); AppShell consumes
// it via `useSectionRegistry`.
//
// The SECOND door param is the chats PROJECTION body: chat-owned chat-row
// anatomy, hosted by this section's CONTEXT pane. Same posture as the contributor registry — character never
// imports chat, chat never imports character, and `client-features-no-cross` keeps enforcing it.
//
// THE LIST PANE NEVER SWAPS (#501, owner ruling 2026-08-22 — "library stays docked"). It used to be MODAL:
// selecting somebody replaced the library with her chats (the
// unconditional arm — a design RECOMMENDATION, never an owner-ruled ledger
// entry, and whose priced cost was exactly "you can't browse the library while editing her"). On the owner's
// 327-character library that price came due: the section whose whole job is browsing a big library lost the
// library on every pick, so "look at the next one" cost a back-chevron trip (side-eye 2026-08-22
// rail-characters, the taste verdict). The list is now the library, always — the chats-section shape (LIST
// drives CONTENT, LIST never becomes something else) — and her chats moved to CONTEXT, where artifact-scoped
// detail belongs (§14). The hero's "N chats ›" reveals that tab (`character-chat-intents.ts`).

import { History, IdCard, Link2, MessagesSquare, Palette, Shield, Users } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { CharacterChatsProjectionView, CharacterContextState, CharacterDetailContribution, ContributorRegistry } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { characterSectionSelection } from "#state";
import { CharacterLibraryAnchor } from "../anchors/character-library-anchor.tsx";
import { CharacterActionsMenu } from "../components/character-actions-menu.tsx";
import { CharacterLookTab } from "../components/character-appearance-tab.tsx";
import { CharacterChatsProjectionShell } from "../components/character-chats-projection-shell.tsx";
import { CharacterContent } from "../components/character-content.tsx";
import { CharacterContextBand } from "../components/character-context-band.tsx";
import { CharacterFacetInspector } from "../components/character-facet-inspector.tsx";
import { CharacterHistoryTab } from "../components/character-history-tab.tsx";
import { CharacterRelationsTab } from "../components/character-relations-tab.tsx";
import { CharacterTrustTab } from "../components/character-trust-tab.tsx";
import { CharactersListHeader } from "../components/characters-list-header.tsx";
import { useCharacterContextState } from "../hooks/use-character-context-state.ts";
import { CharacterLibrarySurface } from "../surfaces/character-library-surface.tsx";
import { CHARACTER_CHATS_TAB_ID } from "./character-chat-intents.ts";
import { useCharactersSelectionTitle } from "./character-selection-title.ts";
import { CHARACTERS_SECTION_LABEL } from "./characters-section-label.ts";

export function makeCharactersSection(
  detailContributors: ContributorRegistry<CharacterDetailContribution>,
  chatsProjection: (view: CharacterChatsProjectionView) => ReactNode,
): SectionDefinition {
  return {
    id: "characters",
    rail: { label: CHARACTERS_SECTION_LABEL, icon: Users, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: CHARACTERS_SECTION_LABEL,
      description: "Your characters live here — browse the list, then open someone to see their card.",
    },
    // The LIBRARY, whatever is selected (#501) — the picker is the pane's ONE role.
    list: () => (
      <CharacterLibraryAnchor>
        <CharacterLibrarySurface />
      </CharacterLibraryAnchor>
    ),
    // …so the band has ONE mode too: `CHARACTERS` + the create primary.
    listHeader: () => <CharactersListHeader />,
    // How the SHELL reads "is someone open?" — the mobile ONE-SHELL rule's input + its back affordance.
    selection: characterSectionSelection,
    // …and what the phone topbar calls this screen: the open character, else `Characters · <census>` (#1670).
    useSelectionTitle: useCharactersSelectionTitle,
    content: () => <CharacterContent detailContributors={detailContributors} />,
    // THE SIX-SLOT META RAIL (#860, owner 2026-08-30): Overview · Chats · Links · Look · History · Trust.
    // Overview is the resting card + the drilled facet detail; Chats is #501's home for her threads (the
    // pane the LIST used to become); Links is world books + personas; Look is the theme override +
    // background; History is the snapshot log; Trust is the render posture. The context-panel program seats
    // this roster in a shared foot rail with a kicker on top — the CHROME is its lane's, the ROSTER is here.
    //
    // `Overview`, NOT `Field` (side-eye 2026-08-30 rail-characters P3, #843). The tab's default body is the
    // overview card (#513) with the pick-a-field instruction as its FOOTER — so a tab named "Field"
    // contained no fields until you drilled one, which is the one state its name described. The name now
    // covers both: the card at rest, the drilled facet when there is one.
    //
    // `Look` + `Trust` + `History` WERE ONE TAB CALLED "OPTIONS" (#841). That merge's own premise — a
    // signed THREE-tab strip — is what died; see `character-appearance-tab.tsx`'s header for the ruling and
    // the 2253px-in-a-693px-pane measurement that made the split due.
    context: defineContextTabs<CharacterContextState>({
      useContextState: useCharacterContextState,
      // THE HEAD BAND (#860): portrait · name · handle line · chips (Own look · N chats · N tokens) in the
      // context bracket's band slot — the pane's identity, over the six-cell rail at its foot.
      header: (s) => <CharacterContextBand characterId={s.characterId} />,
      // The FOOT rail's name — the artifact noun, printed as its kicker ("CHARACTER · OVERVIEW") and carried
      // as its a11y group name.
      railLabel: "Character",
      tabs: [
        {
          id: "overview",
          label: "Overview",
          icon: IdCard,
          body: (s) => <CharacterFacetInspector characterId={s.characterId} />,
        },
        {
          id: CHARACTER_CHATS_TAB_ID,
          label: "Chats",
          icon: MessagesSquare,
          body: (s) => <CharacterChatsProjectionShell characterId={s.characterId} chatsProjection={chatsProjection} />,
        },
        {
          id: "links",
          label: "Links",
          icon: Link2,
          body: (s) => <CharacterRelationsTab characterId={s.characterId} />,
        },
        {
          id: "look",
          label: "Look",
          icon: Palette,
          body: (s) => <CharacterLookTab characterId={s.characterId} />,
        },
        {
          id: "history",
          label: "History",
          icon: History,
          body: (s) => <CharacterHistoryTab characterId={s.characterId} />,
        },
        {
          id: "trust",
          label: "Trust",
          icon: Shield,
          body: (s) => <CharacterTrustTab characterId={s.characterId} />,
        },
      ],
      actions: (s) => <CharacterActionsMenu characterId={s.characterId} />,
      // The no-selection ARM (side-eye F-12) — this pane shared one voiceless
      // "Select something to see its details here." with two other sections.
      empty: {
        title: "Nobody open",
        description:
          "Open someone from your characters and this pane carries an overview of them, your chats together, their world books and personas, their look, their version history and how their cards are trusted.",
      },
    }),
  };
}
