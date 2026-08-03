// The Characters CONTENT body — a selected row opens the editor (a facet-row click reveals the CONTEXT
// Field tab via the shell intent, viewport-resolved in #state); nothing selected shows the teaching
// welcome. Reads its OWN selection from #state so the section definition composing it stays a pure data
// object. Focus restoration for the CONTENT region is the shell's `<main>` job (SectionContent), so this
// branch component is not itself a focus-managing surface.

import type { ReactElement } from "react";
import type { CharacterDetailContribution, ContributorRegistry } from "#lib";
import { revealContextPanel, useSelectedCharacterId } from "#state";
import { CharacterEditorSurface } from "../surfaces/character-editor-surface.tsx";
import { CharacterLibraryWelcome } from "./character-library-welcome.tsx";

export interface CharacterContentProps {
  /** The character-DETAIL contributor registry (§6c) — threaded from `makeCharactersSection` at the door
   *  so the crew feature can graft review sections into the editor body without importing character. */
  readonly detailContributors: ContributorRegistry<CharacterDetailContribution>;
}

export function CharacterContent({ detailContributors }: CharacterContentProps): ReactElement {
  const selectedCharacterId = useSelectedCharacterId();
  if (selectedCharacterId === null) {
    return <CharacterLibraryWelcome />;
  }
  return (
    <CharacterEditorSurface characterId={selectedCharacterId} detailContributors={detailContributors} onRevealField={(): void => revealContextPanel("field")} />
  );
}
