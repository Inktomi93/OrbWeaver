import { CharacterEditorSurface } from "@orb/client/features/character";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders, characterDetailContributors } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production character editor, unmountable so a draft outlives its session the way a closed tab does. */
export function CharacterDraftStatusStory({ characterId, mounted = true }: { readonly characterId: CharacterId; readonly mounted?: boolean }): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        {mounted ? <CharacterEditorSurface characterId={characterId} detailContributors={characterDetailContributors} /> : null}
      </Stack>
    </CtClientProviders>
  );
}
