import { useTRPC } from "@orb/client/data";
import { CharacterEditorSurface } from "@orb/client/features/character";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders, characterDetailContributors } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

function CharacterRead({ characterId, revision }: { readonly characterId: CharacterId; readonly revision: number }): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (revision !== 0) {
      queryClient
        .invalidateQueries(trpc.character.get.queryFilter({ characterId }))
        .then(() => setSettled(revision))
        .catch(globalThis.reportError);
    }
  }, [characterId, queryClient, revision, trpc]);
  return (
    <>
      <output aria-label="Read revision">{settled}</output>
      <CharacterEditorSurface characterId={characterId} detailContributors={characterDetailContributors} />
    </>
  );
}

export function CharacterExampleLifetimeStory({ characterId, revision = 0 }: { readonly characterId: CharacterId; readonly revision?: number }): ReactElement {
  return (
    <CtClientProviders>
      <Stack className="h-screen">
        <CharacterRead characterId={characterId} revision={revision} />
      </Stack>
    </CtClientProviders>
  );
}
