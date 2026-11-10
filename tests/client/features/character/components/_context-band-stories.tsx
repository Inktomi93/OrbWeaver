import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { CharacterContextBand } from "#client/features/character/components/character-context-band.tsx";

/** The character section's context band over one card. */
export function CharacterContextBandStory({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <CtClientProviders>
      <CharacterContextBand characterId={characterId} />
    </CtClientProviders>
  );
}
