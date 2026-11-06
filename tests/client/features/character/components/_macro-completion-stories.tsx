import { CharacterEditorSurface } from "@orb/client/features/character";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders, characterDetailContributors } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

export function CharacterMacroCompletionStory({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <CharacterEditorSurface characterId={characterId} detailContributors={characterDetailContributors} />
      </Stack>
    </CtClientProviders>
  );
}
