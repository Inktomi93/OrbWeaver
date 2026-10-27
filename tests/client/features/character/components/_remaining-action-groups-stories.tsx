import {
  clearCharacterFilters,
  clearCharacterSelection,
  selectCharacter,
  setActiveSection,
  setBulkMode,
  setCharacterSearch,
  setCharacterSortMode,
  setCharacterViewMode,
  setPanelMode,
  toggleFavoritesOnly,
  useSectionRegistry,
} from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { CharacterId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

const PLANES = ["landing", "library", "editor"] as const;
type Plane = (typeof PLANES)[number];

function CharacterContribution({ plane, characterId }: { readonly plane: Plane; readonly characterId: CharacterId }): ReactNode {
  useState(() => {
    setActiveSection("characters");
    setPanelMode("list", "collapsed");
    clearCharacterSelection();
    clearCharacterFilters();
    setBulkMode(false);
    setCharacterViewMode("flat");
    setCharacterSortMode("recent");
    setCharacterSearch(plane === "library" ? "No character has this search phrase" : "");
    if (plane === "library") {
      toggleFavoritesOnly();
    }
    if (plane === "editor") {
      selectCharacter(characterId);
    }
  });
  const definition = useSectionRegistry().get("characters");
  if (plane === "library") {
    if (definition.list === undefined) {
      throw new Error("Characters has no list contribution");
    }
    return definition.list();
  }
  if (typeof definition.content !== "function") {
    throw new Error("Characters has no content contribution");
  }
  return definition.content();
}

/** The production Characters registry reaches its actual landing, filtered-empty library, and greeting editor. */
export function CharacterRemainingActionsStory({
  plane,
  characterId,
  width,
  appearance,
}: {
  readonly plane: Plane;
  readonly characterId: CharacterId;
  readonly width: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container className="h-screen" role="group" aria-label="Character remaining-action host" style={{ inlineSize: width }}>
          <Suspense>
            <CharacterContribution plane={plane} characterId={characterId} />
          </Suspense>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
